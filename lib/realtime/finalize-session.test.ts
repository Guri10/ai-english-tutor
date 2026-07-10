import { describe, expect, test, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeSession } from "./finalize-session";
import type { TranscriptEntry } from "./session-machine";
import type { SessionSummary } from "@/lib/summarization/session-summary-schema";

const transcriptUpsertMock = vi.fn();
const sessionsUpdateEqMock = vi.fn();
const sessionsClaimMaybeSingleMock = vi.fn();
const studentStateMaybeSingleMock = vi.fn();
const studentStateUpsertMock = vi.fn();
const recurringMistakesSelectEqMock = vi.fn();
const recurringMistakesUpsertMock = vi.fn();
const levelHistoryInsertMock = vi.fn();

function mockSupabase(): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === "session_transcripts") {
      return { upsert: transcriptUpsertMock };
    }
    if (table === "sessions") {
      return {
        // finalizeSession's first move is an atomic claim
        // (update({status:"finalizing"}).eq("id",...).in("status",[...])
        // [.eq("last_activity_at",...)].select("id").maybeSingle()); every
        // other sessions.update() call in this file is a plain terminal
        // write (.update().eq(...), awaited directly) — dispatch on the
        // payload so both shapes are mockable from the same table stub.
        update: (payload: { status: string }) => {
          if (payload.status === "finalizing") {
            const claimChain = {
              eq: () => claimChain,
              in: () => claimChain,
              select: () => ({ maybeSingle: sessionsClaimMaybeSingleMock }),
            };
            return claimChain;
          }
          return { eq: sessionsUpdateEqMock };
        },
      };
    }
    if (table === "student_state") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: studentStateMaybeSingleMock }) }),
        upsert: studentStateUpsertMock,
      };
    }
    if (table === "recurring_mistakes") {
      return {
        select: () => ({ eq: recurringMistakesSelectEqMock }),
        upsert: recurringMistakesUpsertMock,
      };
    }
    if (table === "level_history") {
      return { insert: levelHistoryInsertMock };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from } as unknown as SupabaseClient;
}

const transcript: TranscriptEntry[] = [
  { turn: 1, speaker: "student", text: "Hello" },
  { turn: 1, speaker: "tutor", text: "Hi there!" },
];

const baseInput = {
  userId: "user-1",
  sessionId: "session-abc",
  transcript,
  levelBefore: "A1",
  endedAt: "2026-07-08T10:05:00.000Z",
  correctionMode: "summary" as const,
};

describe("finalizeSession", () => {
  beforeEach(() => {
    transcriptUpsertMock.mockReset().mockResolvedValue({ error: null });
    sessionsUpdateEqMock.mockReset().mockResolvedValue({ error: null });
    sessionsClaimMaybeSingleMock
      .mockReset()
      .mockResolvedValue({ data: { id: "session-abc" }, error: null });
    studentStateMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
    studentStateUpsertMock.mockReset().mockResolvedValue({ error: null });
    recurringMistakesSelectEqMock.mockReset().mockResolvedValue({ data: [], error: null });
    recurringMistakesUpsertMock.mockReset().mockResolvedValue({ error: null });
    levelHistoryInsertMock.mockReset().mockResolvedValue({ error: null });
  });

  test("upserts the transcript scoped to the session id", async () => {
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    } satisfies SessionSummary);

    await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(transcriptUpsertMock).toHaveBeenCalledWith(
      { session_id: "session-abc", raw_transcript: transcript },
      { onConflict: "session_id" }
    );
  });

  test("returns skipped and does nothing else when the atomic claim fails (already being finalized elsewhere)", async () => {
    sessionsClaimMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const getSummary = vi.fn();

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({ status: "skipped", levelBefore: "A1" });
    expect(transcriptUpsertMock).not.toHaveBeenCalled();
    expect(getSummary).not.toHaveBeenCalled();
  });

  test("returns skipped when the claim query itself errors", async () => {
    sessionsClaimMaybeSingleMock.mockResolvedValue({ data: null, error: new Error("db error") });
    const getSummary = vi.fn();

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({ status: "skipped", levelBefore: "A1" });
    expect(getSummary).not.toHaveBeenCalled();
  });

  test("leaves the session pending_summary and skips downstream writes when the transcript upsert fails", async () => {
    transcriptUpsertMock.mockResolvedValue({ error: new Error("write failed") });
    const getSummary = vi.fn();

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({ status: "pending_summary", levelBefore: "A1" });
    expect(getSummary).not.toHaveBeenCalled();
  });

  test("marks pending_summary (with ended_at) when getSummary resolves null", async () => {
    const getSummary = vi.fn().mockResolvedValue(null);

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({ status: "pending_summary", levelBefore: "A1" });
    expect(sessionsUpdateEqMock).toHaveBeenCalled();
    expect(studentStateUpsertMock).not.toHaveBeenCalled();
  });

  test("summarizes and returns a completed recap with updated level/streak/mistakes", async () => {
    studentStateMaybeSingleMock.mockResolvedValue({
      data: {
        level_score: "A2",
        streak_count: 3,
        longest_streak: 5,
        total_sessions: 10,
        last_session_at: "2026-07-07T09:00:00.000Z",
      },
      error: null,
    });
    recurringMistakesSelectEqMock.mockResolvedValue({
      data: [{ mistake_type: "article_usage", occurrence_count: 2 }],
      error: null,
    });
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "B1",
      topicsCovered: ["ordering coffee"],
      mistakes: [
        { type: "article_usage", example: "I saw a elephant.", correction: "I saw an elephant." },
      ],
    } satisfies SessionSummary);

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({
      status: "completed",
      levelBefore: "A1",
      levelAfter: "B1",
      streakCount: 4,
      mistakes: [
        { type: "article_usage", example: "I saw a elephant.", correction: "I saw an elephant." },
      ],
      correctedLiveCount: 0,
    });
    expect(levelHistoryInsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      level_score: "B1",
      recorded_at: "2026-07-08T10:05:00.000Z",
    });
    expect(studentStateUpsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      level_score: "B1",
      streak_count: 4,
      longest_streak: 5,
      total_sessions: 11,
      last_session_at: "2026-07-08T10:05:00.000Z",
    });
    expect(recurringMistakesUpsertMock).toHaveBeenCalledWith(
      [
        {
          user_id: "user-1",
          mistake_type: "article_usage",
          occurrence_count: 3,
          last_example: "I saw a elephant.",
          last_seen_at: "2026-07-08T10:05:00.000Z",
        },
      ],
      { onConflict: "user_id,mistake_type" }
    );
  });

  test("suppresses the recap's mistakes list for inline mode without changing recurring_mistakes", async () => {
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [
        { type: "article_usage", example: "I saw a elephant.", correction: "I saw an elephant." },
      ],
    } satisfies SessionSummary);

    const result = await finalizeSession({
      supabase: mockSupabase(),
      getSummary,
      ...baseInput,
      correctionMode: "inline",
    });

    expect(result).toMatchObject({ status: "completed", mistakes: [], correctedLiveCount: 0 });
    expect(recurringMistakesUpsertMock).toHaveBeenCalledTimes(1);
  });

  test("counts isCorrection-tagged transcript entries for the inline recap", async () => {
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    } satisfies SessionSummary);

    const result = await finalizeSession({
      supabase: mockSupabase(),
      getSummary,
      ...baseInput,
      correctionMode: "inline",
      transcript: [
        { turn: 1, speaker: "student", text: "I goed to the park" },
        { turn: 1, speaker: "tutor", text: "It's 'I went'.", isCorrection: true },
        { turn: 2, speaker: "student", text: "I see a elephant" },
        { turn: 2, speaker: "tutor", text: "Nice!" },
      ],
    });

    expect(result).toMatchObject({ status: "completed", correctedLiveCount: 1 });
  });

  test("skips the recurring_mistakes upsert entirely when there are no mistakes", async () => {
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    } satisfies SessionSummary);

    await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(recurringMistakesUpsertMock).not.toHaveBeenCalled();
  });

  test("leaves the session pending_summary when the student_state read fails, without writing progress", async () => {
    studentStateMaybeSingleMock.mockResolvedValue({
      data: null,
      error: new Error("connection reset"),
    });
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    } satisfies SessionSummary);

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({ status: "pending_summary", levelBefore: "A1" });
    expect(studentStateUpsertMock).not.toHaveBeenCalled();
  });

  test("leaves the session pending_summary when the recurring_mistakes read fails", async () => {
    recurringMistakesSelectEqMock.mockResolvedValue({
      data: null,
      error: new Error("connection reset"),
    });
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    } satisfies SessionSummary);

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({ status: "pending_summary", levelBefore: "A1" });
  });

  test("leaves the session pending_summary when a progress-state write fails, without claiming completion", async () => {
    studentStateUpsertMock.mockResolvedValue({ error: new Error("write failed") });
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    } satisfies SessionSummary);

    const result = await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(result).toEqual({ status: "pending_summary", levelBefore: "A1" });
  });

  test("batches multiple recurring_mistakes upserts into a single call", async () => {
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [
        { type: "article_usage", example: "a elephant", correction: "an elephant" },
        { type: "past_tense", example: "I goed", correction: "I went" },
      ],
    } satisfies SessionSummary);

    await finalizeSession({ supabase: mockSupabase(), getSummary, ...baseInput });

    expect(recurringMistakesUpsertMock).toHaveBeenCalledTimes(1);
    const [[rows]] = recurringMistakesUpsertMock.mock.calls;
    expect(rows).toHaveLength(2);
  });

  test("passes the endedAt param through to the sessions/level_history/session updates", async () => {
    const getSummary = vi.fn().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    } satisfies SessionSummary);

    await finalizeSession({
      supabase: mockSupabase(),
      getSummary,
      ...baseInput,
      endedAt: "2099-01-01T00:00:00.000Z",
    });

    expect(levelHistoryInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ recorded_at: "2099-01-01T00:00:00.000Z" })
    );
  });
});
