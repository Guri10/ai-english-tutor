import { describe, expect, test } from "vitest";
import { isProtectedPath, resolveProtectedRouteRedirect } from "./route-guard";

describe("isProtectedPath", () => {
  test("the practice route is protected", () => {
    expect(isProtectedPath("/practice")).toBe(true);
  });

  test("nested practice routes are protected", () => {
    expect(isProtectedPath("/practice/session-123")).toBe(true);
  });

  test("the home route is not protected", () => {
    expect(isProtectedPath("/")).toBe(false);
  });

  test("the sign-in route is not protected", () => {
    expect(isProtectedPath("/sign-in")).toBe(false);
  });

  test("the auth callback route is not protected", () => {
    expect(isProtectedPath("/auth/callback")).toBe(false);
  });

  test("a route merely prefixed with 'practice' is not protected", () => {
    expect(isProtectedPath("/practice-notes")).toBe(false);
  });
});

describe("resolveProtectedRouteRedirect", () => {
  test("unauthenticated visitor to a protected route is redirected to sign-in with a return path", () => {
    expect(resolveProtectedRouteRedirect("/practice", false)).toBe(
      "/sign-in?redirectTo=%2Fpractice"
    );
  });

  test("authenticated visitor to a protected route is not redirected", () => {
    expect(resolveProtectedRouteRedirect("/practice", true)).toBeNull();
  });

  test("unauthenticated visitor to a public route is not redirected", () => {
    expect(resolveProtectedRouteRedirect("/sign-in", false)).toBeNull();
  });

  test("authenticated visitor to a public route is not redirected", () => {
    expect(resolveProtectedRouteRedirect("/", true)).toBeNull();
  });
});
