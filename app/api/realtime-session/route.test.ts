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

describe("POST /api/realtime-session", () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    fromMock.mockReset();
    clientSecretsCreateMock.mockReset();
  });

  test("returns 401 when the user is not authenticated", async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    const response = await POST();

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

    const response = await POST();
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

    const response = await POST();

    expect(response.status).toBe(502);
  });
});
