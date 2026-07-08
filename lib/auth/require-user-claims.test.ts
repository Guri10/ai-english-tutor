import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { requireUserClaims } = await import("./require-user-claims");

function mockSupabase(getClaimsResult: unknown) {
  return {
    auth: { getClaims: vi.fn(() => Promise.resolve(getClaimsResult)) },
  } as unknown as SupabaseClient;
}

describe("requireUserClaims", () => {
  test("returns the claims when the user is authenticated", async () => {
    const supabase = mockSupabase({
      data: { claims: { sub: "user-1", email: "a@b.com" } },
    });

    const claims = await requireUserClaims(supabase);

    expect(claims).toEqual({ sub: "user-1", email: "a@b.com" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("redirects to sign-in when claims are absent", async () => {
    const supabase = mockSupabase({ data: null });

    await expect(requireUserClaims(supabase)).rejects.toThrow(
      "REDIRECT:/sign-in"
    );
    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });
});
