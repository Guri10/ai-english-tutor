import { describe, expect, test, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActiveSession } from "./resolve-active-session";

const updateEqChainMock = vi.fn();
const insertSelectSingleMock = vi.fn();

function mockSupabase(): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table !== "sessions") throw new Error(`unexpected table: ${table}`);
    return {
      update: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: updateEqChainMock }) }) }) }),
      }),
      insert: () => ({ select: () => ({ single: insertSelectSingleMock }) }),
    };
  });
  return { from } as unknown as SupabaseClient;
}

const baseInput = {
  userId: "user-1",
  correctionMode: "inline" as const,
  levelBefore: "A1",
};

describe("resolveActiveSession", () => {
  beforeEach(() => {
    updateEqChainMock.mockReset();
    insertSelectSingleMock.mockReset().mockResolvedValue({
      data: { id: "session-new" },
      error: null,
    });
  });

  test("creates a new active session row when there's no existingSessionId (first connect)", async () => {
    const result = await resolveActiveSession({ supabase: mockSupabase(), ...baseInput });

    expect(result).toEqual({ ok: true, sessionId: "session-new" });
    expect(updateEqChainMock).not.toHaveBeenCalled();
  });

  test("reuses the existing session on reconnect when it's still the caller's active session", async () => {
    updateEqChainMock.mockResolvedValue({ data: { id: "session-existing" }, error: null });

    const result = await resolveActiveSession({
      supabase: mockSupabase(),
      ...baseInput,
      existingSessionId: "session-existing",
    });

    expect(result).toEqual({ ok: true, sessionId: "session-existing" });
    expect(insertSelectSingleMock).not.toHaveBeenCalled();
  });

  test("falls back to creating a new session when the existing one no longer resolves (already finalized)", async () => {
    updateEqChainMock.mockResolvedValue({ data: null, error: null });

    const result = await resolveActiveSession({
      supabase: mockSupabase(),
      ...baseInput,
      existingSessionId: "session-gone",
    });

    expect(result).toEqual({ ok: true, sessionId: "session-new" });
  });

  test("returns ok:false when the fallback insert also fails", async () => {
    insertSelectSingleMock.mockResolvedValue({ data: null, error: new Error("insert failed") });

    const result = await resolveActiveSession({ supabase: mockSupabase(), ...baseInput });

    expect(result).toEqual({ ok: false });
  });
});
