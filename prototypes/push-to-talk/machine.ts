// PROTOTYPE — pure logic module, portable into the real app.
// Question this answers: does the push-to-talk session state machine hold up
// under the edge cases in docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md
// (§3 turn mechanics, §4 error handling) — illegal button presses, connection
// drops mid-turn, and correction-mode-tagged transcript segments feeding the
// end-of-session recap?
//
// No I/O in this file. The TUI shell (tui.ts) is the only thing that touches
// the terminal.

export type CorrectionMode = "inline" | "summary";

export type Phase =
  | "idle"
  | "connecting"
  | "ready"
  | "recording"
  | "committing"
  | "responding"
  | "error"
  | "ended";

export type TranscriptEntry = {
  turn: number;
  speaker: "student" | "tutor";
  text: string;
  isCorrection?: boolean;
};

export type MistakeNote = {
  turn: number;
  text: string;
};

export type SessionState = {
  phase: Phase;
  correctionMode: CorrectionMode;
  turn: number;
  transcript: TranscriptEntry[];
  pendingMistakes: MistakeNote[];
  connectionDroppedDuring: Phase | null;
  lastError: string | null;
};

export type Action =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "CONNECT_FAILED"; reason: string }
  | { type: "SET_CORRECTION_MODE"; mode: CorrectionMode }
  | { type: "MIC_DOWN" }
  | { type: "MIC_UP" }
  | { type: "RESPONSE_START" }
  | { type: "RESPONSE_TEXT_CHUNK"; text: string; isCorrection?: boolean }
  | { type: "RESPONSE_DONE" }
  | { type: "CONNECTION_DROPPED" }
  | { type: "RECONNECT" }
  | { type: "END_SESSION" };

export function initialState(correctionMode: CorrectionMode = "inline"): SessionState {
  return {
    phase: "idle",
    correctionMode,
    turn: 0,
    transcript: [],
    pendingMistakes: [],
    connectionDroppedDuring: null,
    lastError: null,
  };
}

function illegal(state: SessionState, message: string): SessionState {
  return { ...state, lastError: message };
}

function currentTutorEntry(state: SessionState): TranscriptEntry | undefined {
  const last = state.transcript[state.transcript.length - 1];
  return last && last.speaker === "tutor" && last.turn === state.turn ? last : undefined;
}

export function reduce(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "CONNECT": {
      if (state.phase !== "idle" && state.phase !== "error") {
        return illegal(state, `CONNECT is illegal in phase "${state.phase}"`);
      }
      return { ...state, phase: "connecting", lastError: null };
    }

    case "CONNECTED": {
      if (state.phase !== "connecting") {
        return illegal(state, `CONNECTED is illegal in phase "${state.phase}"`);
      }
      return { ...state, phase: "ready", connectionDroppedDuring: null, lastError: null };
    }

    case "CONNECT_FAILED": {
      if (state.phase !== "connecting") {
        return illegal(state, `CONNECT_FAILED is illegal in phase "${state.phase}"`);
      }
      return { ...state, phase: "error", lastError: action.reason };
    }

    case "SET_CORRECTION_MODE": {
      // Spec: correction mode is "overridable at session start" — locked once
      // the first turn has happened.
      if (state.turn > 0) {
        return illegal(state, "correction mode is locked after the first turn");
      }
      return { ...state, correctionMode: action.mode, lastError: null };
    }

    case "MIC_DOWN": {
      if (state.phase !== "ready") {
        return illegal(state, `MIC_DOWN is illegal in phase "${state.phase}" (turn-based: one party talks at a time)`);
      }
      return {
        ...state,
        phase: "recording",
        turn: state.turn + 1,
        transcript: [...state.transcript, { turn: state.turn + 1, speaker: "student", text: "(recording audio…)" }],
        lastError: null,
      };
    }

    case "MIC_UP": {
      if (state.phase !== "recording") {
        return illegal(state, `MIC_UP is illegal in phase "${state.phase}"`);
      }
      return { ...state, phase: "committing", lastError: null };
    }

    case "RESPONSE_START": {
      if (state.phase !== "committing") {
        return illegal(state, `RESPONSE_START is illegal in phase "${state.phase}"`);
      }
      return {
        ...state,
        phase: "responding",
        transcript: [...state.transcript, { turn: state.turn, speaker: "tutor", text: "" }],
        lastError: null,
      };
    }

    case "RESPONSE_TEXT_CHUNK": {
      if (state.phase !== "responding") {
        return illegal(state, `RESPONSE_TEXT_CHUNK is illegal in phase "${state.phase}"`);
      }
      const entry = currentTutorEntry(state);
      if (!entry) return illegal(state, "no in-progress tutor entry to append to");

      const updatedEntry: TranscriptEntry = {
        ...entry,
        text: entry.text + action.text,
        isCorrection: entry.isCorrection || action.isCorrection,
      };
      const transcript = [...state.transcript.slice(0, -1), updatedEntry];

      // Defensive: capture correction chunks into pendingMistakes regardless
      // of mode. In "summary" mode the model is *instructed* never to emit
      // these mid-conversation, but the client shouldn't silently drop one if
      // it happens — it should still show up in the recap.
      const pendingMistakes = action.isCorrection
        ? [...state.pendingMistakes, { turn: state.turn, text: action.text }]
        : state.pendingMistakes;

      return { ...state, transcript, pendingMistakes, lastError: null };
    }

    case "RESPONSE_DONE": {
      if (state.phase !== "responding") {
        return illegal(state, `RESPONSE_DONE is illegal in phase "${state.phase}"`);
      }
      return { ...state, phase: "ready", lastError: null };
    }

    case "CONNECTION_DROPPED": {
      if (state.phase === "idle" || state.phase === "error" || state.phase === "ended") {
        return illegal(state, `CONNECTION_DROPPED is illegal in phase "${state.phase}"`);
      }
      // Transcript captured so far is preserved client-side (spec §4).
      return { ...state, phase: "error", connectionDroppedDuring: state.phase, lastError: "connection dropped" };
    }

    case "RECONNECT": {
      if (state.phase !== "error") {
        return illegal(state, `RECONNECT is illegal in phase "${state.phase}"`);
      }
      return { ...state, phase: "connecting", lastError: null };
    }

    case "END_SESSION": {
      if (state.phase === "idle" || state.phase === "ended") {
        return illegal(state, `END_SESSION is illegal in phase "${state.phase}"`);
      }
      // Best-effort close from any phase — recording/committing/responding
      // included — mirrors the beforeunload/15-min-sweep backstop in spec §4:
      // whatever transcript exists gets used, nothing blocks on a clean turn.
      return { ...state, phase: "ended", lastError: null };
    }

    default:
      return state;
  }
}

// Derived view used by the end-of-session recap screen. Not part of the
// reducer's state shape because it's a pure projection, computed on demand —
// exactly the kind of thing the real recap component would call.
export function recap(state: SessionState): { showsCorrections: boolean; mistakes: MistakeNote[] } {
  // Inline mode already delivered corrections live — recap is level/streak
  // only. Summary mode surfaces them here for the first time.
  const showsCorrections = state.correctionMode === "summary" && state.pendingMistakes.length > 0;
  return { showsCorrections, mistakes: showsCorrections ? state.pendingMistakes : [] };
}
