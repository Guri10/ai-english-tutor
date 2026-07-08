import { describe, expect, it } from "vitest";
import { buildSessionEndPayload } from "./shape-session-end";
import type { TranscriptEntry } from "./session-machine";

describe("buildSessionEndPayload", () => {
  const transcript: TranscriptEntry[] = [
    { turn: 1, speaker: "student", text: "Hello" },
    { turn: 1, speaker: "tutor", text: "Hi there!" },
  ];

  it("builds a sessions insert row scoped to the user with no summarization fields set", () => {
    const { sessionRow } = buildSessionEndPayload("user-1", {
      transcript,
      startedAt: "2026-07-08T10:00:00.000Z",
      endedAt: "2026-07-08T10:05:00.000Z",
      levelBefore: "B1",
      correctionMode: "inline",
    });

    expect(sessionRow).toEqual({
      user_id: "user-1",
      correction_mode_used: "inline",
      started_at: "2026-07-08T10:00:00.000Z",
      ended_at: "2026-07-08T10:05:00.000Z",
      level_before: "B1",
    });
  });

  it("carries the transcript through unmodified as the raw_transcript payload", () => {
    const { rawTranscript } = buildSessionEndPayload("user-1", {
      transcript,
      startedAt: "2026-07-08T10:00:00.000Z",
      endedAt: "2026-07-08T10:05:00.000Z",
      levelBefore: "B1",
      correctionMode: "inline",
    });

    expect(rawTranscript).toEqual(transcript);
  });

  it("handles an empty transcript (session ended with no turns)", () => {
    const { rawTranscript } = buildSessionEndPayload("user-1", {
      transcript: [],
      startedAt: "2026-07-08T10:00:00.000Z",
      endedAt: "2026-07-08T10:00:05.000Z",
      levelBefore: "A1",
      correctionMode: "summary",
    });

    expect(rawTranscript).toEqual([]);
  });
});
