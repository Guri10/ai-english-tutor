import type { CorrectionMode, TranscriptEntry } from "./session-machine";

export type EndSessionInput = {
  transcript: TranscriptEntry[];
  startedAt: string;
  endedAt: string;
  levelBefore: string;
  correctionMode: CorrectionMode;
};

export type SessionInsertRow = {
  user_id: string;
  correction_mode_used: CorrectionMode;
  started_at: string;
  ended_at: string;
  level_before: string;
};

export type SessionEndPayload = {
  sessionRow: SessionInsertRow;
  rawTranscript: TranscriptEntry[];
};

// `sessions.status` defaults to 'pending_summary' in the schema and
// level_after/scenario_topic are left unset — no summarization exists yet
// (issue #4's job); this just persists what a session-orchestration slice
// actually has: who talked, when, and the student's level going in.
export function buildSessionEndPayload(
  userId: string,
  input: EndSessionInput
): SessionEndPayload {
  return {
    sessionRow: {
      user_id: userId,
      correction_mode_used: input.correctionMode,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      level_before: input.levelBefore,
    },
    rawTranscript: input.transcript,
  };
}
