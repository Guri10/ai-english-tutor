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

function mockEmptyTables() {
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
