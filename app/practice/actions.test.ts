import { describe, expect, test, vi, beforeEach } from "vitest";

const getClaimsMock = vi.fn();
const sessionsInsertSelectSingleMock = vi.fn();
const transcriptsInsertMock = vi.fn();
const fromMock = vi.fn((table: string) => {
  if (table === "sessions") {
    return {
      insert: () => ({
        select: () => ({ single: sessionsInsertSelectSingleMock }),
      }),
    };
  }
  if (table === "session_transcripts") {
    return { insert: transcriptsInsertMock };
  }
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getClaims: getClaimsMock }, from: fromMock })
  ),
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
    transcriptsInsertMock.mockReset();
  });

  test("returns an error and writes nothing when unauthenticated", async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(sessionsInsertSelectSingleMock).not.toHaveBeenCalled();
  });

  test("inserts the session row then the transcript scoped to its id", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    sessionsInsertSelectSingleMock.mockResolvedValue({
      data: { id: "session-abc" },
      error: null,
    });
    transcriptsInsertMock.mockResolvedValue({ error: null });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: true });
    expect(transcriptsInsertMock).toHaveBeenCalledWith({
      session_id: "session-abc",
      raw_transcript: validInput.transcript,
    });
  });

  test("returns an error and skips the transcript write when the session insert fails", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    sessionsInsertSelectSingleMock.mockResolvedValue({
      data: null,
      error: new Error("insert failed"),
    });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: false, error: "failed to save session" });
    expect(transcriptsInsertMock).not.toHaveBeenCalled();
  });

  test("returns an error when the transcript insert fails", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    sessionsInsertSelectSingleMock.mockResolvedValue({
      data: { id: "session-abc" },
      error: null,
    });
    transcriptsInsertMock.mockResolvedValue({ error: new Error("insert failed") });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: false, error: "failed to save transcript" });
  });
});
