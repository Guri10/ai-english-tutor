import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClaims } from "./get-user-claims";

function mockSupabase(getClaimsResult: unknown) {
  return {
    auth: { getClaims: vi.fn(() => Promise.resolve(getClaimsResult)) },
  } as unknown as SupabaseClient;
}

describe("getUserClaims", () => {
  test("returns the claims when the user is authenticated", async () => {
    const supabase = mockSupabase({
      data: { claims: { sub: "user-1", email: "a@b.com" } },
    });

    expect(await getUserClaims(supabase)).toEqual({
      sub: "user-1",
      email: "a@b.com",
    });
  });

  test("returns null when claims are absent", async () => {
    const supabase = mockSupabase({ data: null });
    expect(await getUserClaims(supabase)).toBeNull();
  });
});
