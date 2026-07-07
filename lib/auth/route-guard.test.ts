import { describe, expect, test } from "vitest";
import {
  isProtectedPath,
  resolveProtectedRouteRedirect,
  sanitizeNextPath,
} from "./route-guard";

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

describe("sanitizeNextPath", () => {
  test("a plain relative path is kept as-is", () => {
    expect(sanitizeNextPath("/practice")).toBe("/practice");
  });

  test("null falls back to the default", () => {
    expect(sanitizeNextPath(null)).toBe("/practice");
  });

  test("a protocol-relative path ('//evil.com') falls back to the default", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/practice");
  });

  test("a backslash-based protocol-relative path falls back to the default", () => {
    expect(sanitizeNextPath("/\\evil.com")).toBe("/practice");
  });

  test("a domain-suffix trick ('.evil.com', no leading slash) falls back to the default", () => {
    expect(sanitizeNextPath(".evil.com/phish")).toBe("/practice");
  });

  test("a full absolute URL falls back to the default", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/practice");
  });

  // The WHATWG URL parser strips ASCII tab/newline/CR *anywhere* in the
  // string before parsing, so a value that looks like a single-segment
  // path to a naive prefix check can still resolve as protocol-relative
  // once actually parsed via `new URL()`.
  test("a tab-interrupted protocol-relative path falls back to the default", () => {
    expect(sanitizeNextPath("/\t/evil.com")).toBe("/practice");
  });

  test("a newline-interrupted protocol-relative path falls back to the default", () => {
    expect(sanitizeNextPath("/\n/evil.com")).toBe("/practice");
  });

  test("a carriage-return-interrupted protocol-relative path falls back to the default", () => {
    expect(sanitizeNextPath("/\r/evil.com")).toBe("/practice");
  });

  test("a tab-interrupted backslash path falls back to the default", () => {
    expect(sanitizeNextPath("/\t\\evil.com")).toBe("/practice");
  });

  test("control characters are stripped from an otherwise-legitimate path", () => {
    expect(sanitizeNextPath("/practice/\tsession-1")).toBe(
      "/practice/session-1"
    );
  });
});
