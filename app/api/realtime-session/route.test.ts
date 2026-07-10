import { describe, expect, test, vi, beforeEach } from "vitest";

const getClaimsMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getClaims: getClaimsMock },
      from: fromMock,
    })
  ),
}));

const clientSecretsCreateMock = vi.fn();
vi.mock("@/lib/openai/server-client", () => ({
  createOpenAIClient: vi.fn(() => ({
    realtime: { clientSecrets: { create: clientSecretsCreateMock } },
  })),
}));

const { POST } = await import("./route");

const sessionsInsertSelectSingleMock = vi.fn();
const sessionsUpdateMaybeSingleMock = vi.fn();

function mockEmptyTables() {
  sessionsInsertSelectSingleMock.mockReset().mockResolvedValue({
    data: { id: "session-new" },
    error: null,
  });
  sessionsUpdateMaybeSingleMock.mockReset().mockResolvedValue({
    data: { id: "session-reused" },
    error: null,
  });
  fromMock.mockImplementation((table: string) => {
    if (table === "student_state") {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    }
    if (table === "recurring_mistakes") {
      return {
        select: () => ({
          eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
        }),
      };
    }
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ count: 0, error: null }) }),
        }),
        insert: () => ({
          select: () => ({ single: sessionsInsertSelectSingleMock }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: sessionsUpdateMaybeSingleMock }) }) }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/realtime-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/realtime-session", () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    fromMock.mockReset();
    clientSecretsCreateMock.mockReset();
  });

  test("returns 401 when the user is not authenticated", async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(clientSecretsCreateMock).not.toHaveBeenCalled();
  });

  test("mints a client secret with instructions built from the student's context", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    clientSecretsCreateMock.mockResolvedValue({
      value: "ek_abc123",
      expires_at: 1234567890,
    });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      value: "ek_abc123",
      expiresAt: 1234567890,
      levelScore: "A1",
      correctionMode: "inline",
      sessionId: "session-new",
    });

    const [[createArgs]] = clientSecretsCreateMock.mock.calls;
    expect(createArgs.session.audio.input.turn_detection).toBeNull();
    expect(createArgs.session.instructions).toContain("A1");
  });

  test("returns 502 when minting the client secret fails", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    clientSecretsCreateMock.mockRejectedValue(new Error("network down"));

    const response = await POST(makeRequest());

    expect(response.status).toBe(502);
  });

  test("returns 500 and does not mint a client secret twice when the session-row insert fails", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    sessionsInsertSelectSingleMock.mockResolvedValue({
      data: null,
      error: new Error("insert failed"),
    });
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(clientSecretsCreateMock).toHaveBeenCalledTimes(1);
  });

  test("returns 429 and never mints a client secret once the daily session cap is reached", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    fromMock.mockImplementation((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({ eq: () => ({ gte: () => Promise.resolve({ count: 10, error: null }) }) }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(429);
    expect(clientSecretsCreateMock).not.toHaveBeenCalled();
  });

  test("skips the daily-cap check entirely for a reconnect (existing sessionId)", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    const countGteMock = vi.fn().mockResolvedValue({ count: 10, error: null });
    const originalSessionsFrom = fromMock.getMockImplementation();
    fromMock.mockImplementation((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({ eq: () => ({ gte: countGteMock }) }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({ select: () => ({ maybeSingle: sessionsUpdateMaybeSingleMock }) }),
              }),
            }),
          }),
        };
      }
      return originalSessionsFrom!(table);
    });
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    const response = await POST(makeRequest({ sessionId: "session-existing" }));

    expect(response.status).toBe(200);
    expect(countGteMock).not.toHaveBeenCalled();
  });

  test("allows starting a session when today's count is below the cap", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
  });

  test("reuses the existing session on reconnect instead of creating a new row", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    const response = await POST(makeRequest({ sessionId: "session-existing" }));
    const body = await response.json();

    expect(body.sessionId).toBe("session-reused");
    expect(sessionsInsertSelectSingleMock).not.toHaveBeenCalled();
  });

  test("uses a valid correctionMode override from the request body instead of the profile default", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables(); // profile default resolves to "inline"
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    const response = await POST(makeRequest({ correctionMode: "summary" }));
    const body = await response.json();

    expect(body.correctionMode).toBe("summary");
    const [[createArgs]] = clientSecretsCreateMock.mock.calls;
    expect(createArgs.session.instructions.toLowerCase()).toContain("never correct");
  });

  test("falls back to the profile default when the override is not a real correction mode", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    const response = await POST(makeRequest({ correctionMode: "not-a-real-mode" }));
    const body = await response.json();

    expect(body.correctionMode).toBe("inline");
  });

  test("falls back to the profile default when the request body is empty", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(body.correctionMode).toBe("inline");
  });

  test("registers the flag_correction tool only for inline mode", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mockEmptyTables();
    clientSecretsCreateMock.mockResolvedValue({ value: "ek_abc123", expires_at: 1 });

    await POST(makeRequest({ correctionMode: "inline" }));
    const [[inlineArgs]] = clientSecretsCreateMock.mock.calls;
    expect(inlineArgs.session.tools).toEqual([
      expect.objectContaining({ type: "function", name: "flag_correction" }),
    ]);

    clientSecretsCreateMock.mockClear();
    await POST(makeRequest({ correctionMode: "summary" }));
    const [[summaryArgs]] = clientSecretsCreateMock.mock.calls;
    expect(summaryArgs.session.tools).toBeUndefined();
  });
});
