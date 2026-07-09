import { describe, expect, test, vi, beforeEach } from "vitest";

const getClaimsMock = vi.fn();
const sessionsInsertSelectSingleMock = vi.fn();
const sessionsUpdateEqMock = vi.fn();
const transcriptsInsertMock = vi.fn();
const studentStateMaybeSingleMock = vi.fn();
const studentStateUpsertMock = vi.fn();
const recurringMistakesSelectEqMock = vi.fn();
const recurringMistakesUpsertMock = vi.fn();
const levelHistoryInsertMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "sessions") {
    return {
      insert: () => ({
        select: () => ({ single: sessionsInsertSelectSingleMock }),
      }),
      update: () => ({ eq: sessionsUpdateEqMock }),
    };
  }
  if (table === "session_transcripts") {
    return { insert: transcriptsInsertMock };
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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getClaims: getClaimsMock }, from: fromMock })
  ),
}));

vi.mock("@/lib/openai/server-client", () => ({
  createOpenAIClient: vi.fn(() => ({})),
}));

const summarizeSessionMock = vi.fn();
vi.mock("@/lib/summarization/summarize-session", () => ({
  summarizeSession: (...args: unknown[]) => summarizeSessionMock(...args),
}));

const { endPracticeSession } = await import("./actions");

const validInput = {
  transcript: [{ turn: 1, speaker: "student" as const, text: "Hello" }],
  startedAt: "2026-07-08T10:00:00.000Z",
  endedAt: "2026-07-08T10:05:00.000Z",
  levelBefore: "A1",
  correctionMode: "inline" as const,
};

describe("endPracticeSession", () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    sessionsInsertSelectSingleMock.mockReset();
    sessionsUpdateEqMock.mockReset();
    transcriptsInsertMock.mockReset();
    studentStateMaybeSingleMock.mockReset();
    studentStateUpsertMock.mockReset();
    recurringMistakesSelectEqMock.mockReset();
    recurringMistakesUpsertMock.mockReset();
    levelHistoryInsertMock.mockReset();
    summarizeSessionMock.mockReset();

    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    sessionsInsertSelectSingleMock.mockResolvedValue({
      data: { id: "session-abc" },
      error: null,
    });
    sessionsUpdateEqMock.mockResolvedValue({ error: null });
    transcriptsInsertMock.mockResolvedValue({ error: null });
    studentStateMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    studentStateUpsertMock.mockResolvedValue({ error: null });
    recurringMistakesSelectEqMock.mockResolvedValue({ data: [], error: null });
    recurringMistakesUpsertMock.mockResolvedValue({ error: null });
    levelHistoryInsertMock.mockResolvedValue({ error: null });
    summarizeSessionMock.mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    });
  });

  test("returns an error and writes nothing when unauthenticated", async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(sessionsInsertSelectSingleMock).not.toHaveBeenCalled();
    expect(summarizeSessionMock).not.toHaveBeenCalled();
  });

  test("inserts the session row then the transcript scoped to its id", async () => {
    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "completed",
      levelBefore: "A1",
      levelAfter: "A2",
      streakCount: 1,
      mistakes: [],
    });
    expect(transcriptsInsertMock).toHaveBeenCalledWith({
      session_id: "session-abc",
      raw_transcript: validInput.transcript,
    });
  });

  test("returns an error and skips the transcript write when the session insert fails", async () => {
    sessionsInsertSelectSingleMock.mockResolvedValue({
      data: null,
      error: new Error("insert failed"),
    });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: false, error: "failed to save session" });
    expect(transcriptsInsertMock).not.toHaveBeenCalled();
    expect(summarizeSessionMock).not.toHaveBeenCalled();
  });

  test("returns an error when the transcript insert fails", async () => {
    transcriptsInsertMock.mockResolvedValue({ error: new Error("insert failed") });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: false, error: "failed to save transcript" });
    expect(summarizeSessionMock).not.toHaveBeenCalled();
  });

  test("summarizes a non-empty transcript and returns a completed recap with updated level/streak/mistakes", async () => {
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
    summarizeSessionMock.mockResolvedValue({
      levelScore: "B1",
      topicsCovered: ["ordering coffee"],
      mistakes: [
        { type: "article_usage", example: "I saw a elephant.", correction: "I saw an elephant." },
      ],
    });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "completed",
      levelBefore: "A1",
      levelAfter: "B1",
      streakCount: 4,
      mistakes: [
        { type: "article_usage", example: "I saw a elephant.", correction: "I saw an elephant." },
      ],
    });

    expect(summarizeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      validInput.transcript
    );
    expect(sessionsUpdateEqMock).toHaveBeenCalled();
    expect(levelHistoryInsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      level_score: "B1",
      recorded_at: validInput.endedAt,
    });
    expect(studentStateUpsertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      level_score: "B1",
      streak_count: 4,
      longest_streak: 5,
      total_sessions: 11,
      last_session_at: validInput.endedAt,
    });
    expect(recurringMistakesUpsertMock).toHaveBeenCalledTimes(1);
    expect(recurringMistakesUpsertMock).toHaveBeenCalledWith(
      [
        {
          user_id: "user-1",
          mistake_type: "article_usage",
          occurrence_count: 3,
          last_example: "I saw a elephant.",
          last_seen_at: validInput.endedAt,
        },
      ],
      { onConflict: "user_id,mistake_type" }
    );
  });

  test("batches multiple recurring_mistakes upserts into a single call", async () => {
    summarizeSessionMock.mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [
        { type: "article_usage", example: "a elephant", correction: "an elephant" },
        { type: "past_tense", example: "I goed", correction: "I went" },
      ],
    });

    await endPracticeSession(validInput);

    expect(recurringMistakesUpsertMock).toHaveBeenCalledTimes(1);
    const [[rows]] = recurringMistakesUpsertMock.mock.calls;
    expect(rows).toHaveLength(2);
  });

  test("skips the recurring_mistakes upsert call entirely when there are no mistakes", async () => {
    await endPracticeSession(validInput);

    expect(recurringMistakesUpsertMock).not.toHaveBeenCalled();
  });

  test("falls back to the default level and leaves the session pending_summary when the student_state read fails", async () => {
    studentStateMaybeSingleMock.mockResolvedValue({
      data: null,
      error: new Error("connection reset"),
    });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "pending_summary",
      levelBefore: "A1",
    });
    expect(studentStateUpsertMock).not.toHaveBeenCalled();
    expect(sessionsUpdateEqMock).not.toHaveBeenCalled();
  });

  test("leaves the session pending_summary when the recurring_mistakes read fails", async () => {
    recurringMistakesSelectEqMock.mockResolvedValue({
      data: null,
      error: new Error("connection reset"),
    });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "pending_summary",
      levelBefore: "A1",
    });
    expect(studentStateUpsertMock).not.toHaveBeenCalled();
  });

  test("leaves the session pending_summary when a progress-state write fails, without claiming completion", async () => {
    studentStateUpsertMock.mockResolvedValue({ error: new Error("write failed") });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "pending_summary",
      levelBefore: "A1",
    });
  });

  test("falls back to the default level when an empty-transcript session has an invalid levelBefore", async () => {
    const result = await endPracticeSession({
      ...validInput,
      transcript: [],
      levelBefore: "not-a-real-level",
    });

    expect(result).toMatchObject({
      ok: true,
      status: "completed",
      levelAfter: "A1",
    });
  });

  test("skips the summarization call and completes with an unchanged level when the transcript is empty", async () => {
    const result = await endPracticeSession({ ...validInput, transcript: [] });

    expect(summarizeSessionMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      status: "completed",
      levelBefore: "A1",
      levelAfter: "A1",
      mistakes: [],
    });
  });

  test("leaves the session pending_summary and skips all state writes when summarization fails", async () => {
    summarizeSessionMock.mockRejectedValue(new Error("network down"));

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "pending_summary",
      levelBefore: "A1",
    });
    expect(sessionsUpdateEqMock).not.toHaveBeenCalled();
    expect(levelHistoryInsertMock).not.toHaveBeenCalled();
    expect(studentStateUpsertMock).not.toHaveBeenCalled();
    expect(recurringMistakesUpsertMock).not.toHaveBeenCalled();
  });
});
