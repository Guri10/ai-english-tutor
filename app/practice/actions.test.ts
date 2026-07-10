import { describe, expect, test, vi, beforeEach } from "vitest";

const getClaimsMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getClaims: getClaimsMock } })
  ),
}));

vi.mock("@/lib/openai/server-client", () => ({
  createOpenAIClient: vi.fn(() => ({})),
}));

const finalizeSessionMock = vi.fn();
vi.mock("@/lib/realtime/finalize-session", () => ({
  finalizeSession: (...args: unknown[]) => finalizeSessionMock(...args),
}));

const { endPracticeSession } = await import("./actions");

const validInput = {
  sessionId: "session-abc",
  transcript: [{ turn: 1, speaker: "student" as const, text: "Hello" }],
  levelBefore: "A1",
  correctionMode: "inline" as const,
  endedAt: "2026-07-08T10:05:00.000Z",
};

describe("endPracticeSession", () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    finalizeSessionMock.mockReset();

    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    finalizeSessionMock.mockResolvedValue({
      status: "completed",
      levelBefore: "A1",
      levelAfter: "A2",
      streakCount: 1,
      mistakes: [],
      correctedLiveCount: 0,
    });
  });

  test("returns an error and never calls finalizeSession when unauthenticated", async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(finalizeSessionMock).not.toHaveBeenCalled();
  });

  test("delegates to finalizeSession with the resolved user id and input, wrapping the result as ok: true", async () => {
    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "completed",
      levelBefore: "A1",
      levelAfter: "A2",
      streakCount: 1,
      mistakes: [],
      correctedLiveCount: 0,
    });
    expect(finalizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sessionId: "session-abc",
        transcript: validInput.transcript,
        levelBefore: "A1",
        endedAt: "2026-07-08T10:05:00.000Z",
        correctionMode: "inline",
        getSummary: expect.any(Function),
      })
    );
  });

  test("passes through a pending_summary result unchanged, wrapped as ok: true", async () => {
    finalizeSessionMock.mockResolvedValue({
      status: "pending_summary",
      levelBefore: "A1",
    });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "pending_summary",
      levelBefore: "A1",
    });
  });

  test("maps a skipped result (maintenance sweep claimed the session first) to pending_summary", async () => {
    finalizeSessionMock.mockResolvedValue({
      status: "skipped",
      levelBefore: "A1",
    });

    const result = await endPracticeSession(validInput);

    expect(result).toEqual({
      ok: true,
      status: "pending_summary",
      levelBefore: "A1",
    });
  });
});
