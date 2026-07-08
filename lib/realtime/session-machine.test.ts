import { describe, expect, it } from "vitest";
import { initialState, reduce, recap, type SessionState } from "./session-machine";

function connectedState(correctionMode: SessionState["correctionMode"] = "inline"): SessionState {
  let state = initialState(correctionMode);
  state = reduce(state, { type: "CONNECT" });
  state = reduce(state, { type: "CONNECTED" });
  return state;
}

describe("session-machine", () => {
  it("starts idle with no transcript", () => {
    const state = initialState();
    expect(state.phase).toBe("idle");
    expect(state.transcript).toEqual([]);
  });

  describe("illegal button presses", () => {
    it("rejects MIC_DOWN before connecting", () => {
      const state = reduce(initialState(), { type: "MIC_DOWN" });
      expect(state.phase).toBe("idle");
      expect(state.lastError).toMatch(/illegal/i);
    });

    it("rejects a second MIC_DOWN while already recording", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_DOWN" });
      expect(state.phase).toBe("recording");
      expect(state.lastError).toMatch(/illegal/i);
    });

    it("rejects MIC_DOWN while the tutor is responding", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_UP" });
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, { type: "MIC_DOWN" });
      expect(state.phase).toBe("responding");
      expect(state.lastError).toMatch(/illegal/i);
    });

    it("rejects MIC_UP while not recording", () => {
      const state = reduce(connectedState(), { type: "MIC_UP" });
      expect(state.phase).toBe("ready");
      expect(state.lastError).toMatch(/illegal/i);
    });
  });

  describe("connection drops mid-turn", () => {
    it.each(["recording", "committing", "responding"] as const)(
      "preserves the transcript and records the phase when dropped during %s",
      (phase) => {
        let state = connectedState();
        state = reduce(state, { type: "MIC_DOWN" });
        if (phase !== "recording") state = reduce(state, { type: "MIC_UP" });
        if (phase === "responding") state = reduce(state, { type: "RESPONSE_START" });

        const transcriptBeforeDrop = state.transcript;
        state = reduce(state, { type: "CONNECTION_DROPPED" });

        expect(state.phase).toBe("error");
        expect(state.connectionDroppedDuring).toBe(phase);
        expect(state.transcript).toEqual(transcriptBeforeDrop);
      }
    );

    it("clears the error and returns to ready on reconnect", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "CONNECTION_DROPPED" });
      state = reduce(state, { type: "RECONNECT" });
      state = reduce(state, { type: "CONNECTED" });
      expect(state.phase).toBe("ready");
      expect(state.lastError).toBeNull();
      expect(state.connectionDroppedDuring).toBeNull();
    });
  });

  describe("ending mid-turn", () => {
    it("finalizes cleanly from recording", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "END_SESSION" });
      expect(state.phase).toBe("ended");
    });

    it("finalizes cleanly from responding", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_UP" });
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, { type: "END_SESSION" });
      expect(state.phase).toBe("ended");
    });

    it("is illegal from idle", () => {
      const state = reduce(initialState(), { type: "END_SESSION" });
      expect(state.phase).toBe("idle");
      expect(state.lastError).toMatch(/illegal/i);
    });
  });

  describe("correction mode lock", () => {
    it("allows setting the mode before the first turn", () => {
      const state = reduce(connectedState(), {
        type: "SET_CORRECTION_MODE",
        mode: "summary",
      });
      expect(state.correctionMode).toBe("summary");
    });

    it("rejects changing the mode after the first turn", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "SET_CORRECTION_MODE", mode: "summary" });
      expect(state.correctionMode).toBe("inline");
      expect(state.lastError).toMatch(/locked/i);
    });
  });

  describe("STUDENT_TRANSCRIPT", () => {
    it("replaces the placeholder text on the matching turn's student entry", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, {
        type: "STUDENT_TRANSCRIPT",
        turn: 1,
        text: "I goed to the store",
      });
      expect(state.transcript[0]).toMatchObject({
        turn: 1,
        speaker: "student",
        text: "I goed to the store",
      });
    });

    it("does not touch a different turn's entry", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_UP" });
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, { type: "RESPONSE_DONE" });
      state = reduce(state, { type: "MIC_DOWN" });

      state = reduce(state, {
        type: "STUDENT_TRANSCRIPT",
        turn: 1,
        text: "first turn text",
      });

      expect(state.transcript[0].text).toBe("first turn text");
      expect(state.transcript[2].text).toBe("(recording audio…)");
    });

    it("is a no-op with lastError set when no matching student entry exists", () => {
      const state = reduce(connectedState(), {
        type: "STUDENT_TRANSCRIPT",
        turn: 1,
        text: "orphaned",
      });
      expect(state.transcript).toEqual([]);
      expect(state.lastError).toMatch(/no student entry/i);
    });
  });

  describe("opening greeting (no preceding student turn)", () => {
    it("allows RESPONSE_START directly from ready, at turn 0", () => {
      const state = reduce(connectedState(), { type: "RESPONSE_START" });
      expect(state.phase).toBe("responding");
      expect(state.transcript).toEqual([{ turn: 0, speaker: "tutor", text: "" }]);
    });

    it("completes normally and returns to ready without ever recording", () => {
      let state = connectedState();
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, { type: "RESPONSE_TEXT_CHUNK", text: "Hi! Ready to practice?" });
      state = reduce(state, { type: "RESPONSE_DONE" });
      expect(state.phase).toBe("ready");
      expect(state.transcript[0].text).toBe("Hi! Ready to practice?");
    });

    it("rejects a stray RESPONSE_START from ready once a turn has already happened", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_UP" });
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, { type: "RESPONSE_DONE" });
      const transcriptBefore = state.transcript;

      // e.g. a duplicate/replayed response.created after a reconnect —
      // must not inject a second, unsolicited tutor turn.
      state = reduce(state, { type: "RESPONSE_START" });

      expect(state.phase).toBe("ready");
      expect(state.transcript).toEqual(transcriptBefore);
      expect(state.lastError).toMatch(/illegal/i);
    });
  });

  describe("RESPONSE_TEXT_CHUNK", () => {
    it("appends chunks to the in-progress tutor entry", () => {
      let state = connectedState();
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_UP" });
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, { type: "RESPONSE_TEXT_CHUNK", text: "Hello " });
      state = reduce(state, { type: "RESPONSE_TEXT_CHUNK", text: "there!" });
      expect(state.transcript[1]).toMatchObject({
        speaker: "tutor",
        text: "Hello there!",
      });
    });
  });

  describe("recap", () => {
    it("shows no corrections in inline mode even with pending mistakes", () => {
      let state = connectedState("inline");
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_UP" });
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, {
        type: "RESPONSE_TEXT_CHUNK",
        text: "quick note — it's 'I went'",
        isCorrection: true,
      });
      expect(recap(state).showsCorrections).toBe(false);
    });

    it("surfaces pending mistakes in summary mode", () => {
      let state = connectedState("summary");
      state = reduce(state, { type: "MIC_DOWN" });
      state = reduce(state, { type: "MIC_UP" });
      state = reduce(state, { type: "RESPONSE_START" });
      state = reduce(state, {
        type: "RESPONSE_TEXT_CHUNK",
        text: "noted for later",
        isCorrection: true,
      });
      const result = recap(state);
      expect(result.showsCorrections).toBe(true);
      expect(result.mistakes).toHaveLength(1);
    });
  });
});
