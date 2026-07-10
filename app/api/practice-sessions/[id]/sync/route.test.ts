import { describe, expect, test, vi, beforeEach } from "vitest";

const getClaimsMock = vi.fn();
const transcriptUpsertMock = vi.fn();
const sessionsUpdateEqChainMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "session_transcripts") {
    return { upsert: transcriptUpsertMock };
  }
  if (table === "sessions") {
    return {
      update: () => ({
        eq: () => ({ eq: () => ({ eq: sessionsUpdateEqChainMock }) }),
      }),
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getClaims: getClaimsMock }, from: fromMock })
  ),
}));

const { POST } = await import("./route");

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/practice-sessions/session-1/sync", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeParams(id = "session-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/practice-sessions/[id]/sync", () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    transcriptUpsertMock.mockReset().mockResolvedValue({ error: null });
    sessionsUpdateEqChainMock.mockReset().mockResolvedValue({ error: null });
  });

  test("returns 401 when unauthenticated", async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    const response = await POST(makeRequest({ transcript: [] }), makeParams());

    expect(response.status).toBe(401);
    expect(transcriptUpsertMock).not.toHaveBeenCalled();
  });

  test("returns 400 when the body has no transcript array", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const response = await POST(makeRequest({}), makeParams());

    expect(response.status).toBe(400);
    expect(transcriptUpsertMock).not.toHaveBeenCalled();
  });

  test("upserts the transcript and bumps last_activity_at for the caller's active session", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    const transcript = [{ turn: 1, speaker: "student", text: "hi" }];

    const response = await POST(makeRequest({ transcript }), makeParams("session-1"));

    expect(response.status).toBe(200);
    expect(transcriptUpsertMock).toHaveBeenCalledWith(
      { session_id: "session-1", raw_transcript: transcript },
      { onConflict: "session_id" }
    );
    expect(sessionsUpdateEqChainMock).toHaveBeenCalled();
  });

  test("returns 500 when a write fails", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    transcriptUpsertMock.mockResolvedValue({ error: new Error("write failed") });

    const response = await POST(makeRequest({ transcript: [] }), makeParams());

    expect(response.status).toBe(500);
  });
});
