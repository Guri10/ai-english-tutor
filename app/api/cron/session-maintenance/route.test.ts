import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const runSessionMaintenanceMock = vi.fn();
vi.mock("@/lib/realtime/run-session-maintenance", () => ({
  runSessionMaintenance: (...args: unknown[]) => runSessionMaintenanceMock(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/openai/server-client", () => ({
  createOpenAIClient: vi.fn(() => ({})),
}));

const { POST } = await import("./route");

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/cron/session-maintenance", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("POST /api/cron/session-maintenance", () => {
  beforeEach(() => {
    runSessionMaintenanceMock.mockReset().mockResolvedValue({
      abandonedFinalized: 0,
      abandonedFound: 0,
      pendingRetried: 0,
      pendingFound: 0,
    });
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns 401 when no authorization header is sent", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(runSessionMaintenanceMock).not.toHaveBeenCalled();
  });

  test("returns 401 when the bearer token doesn't match CRON_SECRET", async () => {
    const response = await POST(makeRequest("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(runSessionMaintenanceMock).not.toHaveBeenCalled();
  });

  test("returns 401 when CRON_SECRET isn't configured, even if a header is sent", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(makeRequest("Bearer test-cron-secret"));

    expect(response.status).toBe(401);
  });

  test("runs maintenance and returns its result when the secret matches", async () => {
    runSessionMaintenanceMock.mockResolvedValue({
      abandonedFinalized: 2,
      abandonedFound: 2,
      pendingRetried: 1,
      pendingFound: 3,
    });

    const response = await POST(makeRequest("Bearer test-cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      abandonedFinalized: 2,
      abandonedFound: 2,
      pendingRetried: 1,
      pendingFound: 3,
    });
  });
});
