import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDefaultCorrectionMode } from "./fetch-default-correction-mode";

type QueryResult = { data: unknown; error: unknown };

function mockSupabase(profile: QueryResult, eqSpy = vi.fn()) {
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: (...args: unknown[]) => {
            eqSpy(table, ...args);
            return { maybeSingle: () => Promise.resolve(profile) };
          },
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from } as unknown as SupabaseClient;
}

describe("fetchDefaultCorrectionMode", () => {
  test("returns the profile's stored correction mode", async () => {
    const supabase = mockSupabase({ data: { correction_mode: "summary" }, error: null });

    const result = await fetchDefaultCorrectionMode(supabase, "user-123");

    expect(result).toBe("summary");
  });

  test("defaults to inline for a brand-new user with no profile row yet", async () => {
    const supabase = mockSupabase({ data: null, error: null });

    const result = await fetchDefaultCorrectionMode(supabase, "user-456");

    expect(result).toBe("inline");
  });

  test("scopes the query to the given user id", async () => {
    const eqSpy = vi.fn();
    const supabase = mockSupabase({ data: null, error: null }, eqSpy);

    await fetchDefaultCorrectionMode(supabase, "user-789");

    expect(eqSpy).toHaveBeenCalledWith("profiles", "id", "user-789");
  });

  test("logs an error and still defaults to inline when the query fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = mockSupabase({ data: null, error: new Error("connection reset") });

    const result = await fetchDefaultCorrectionMode(supabase, "user-999");

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(result).toBe("inline");

    consoleErrorSpy.mockRestore();
  });
});
