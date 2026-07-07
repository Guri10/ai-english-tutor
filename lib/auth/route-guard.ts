export function isProtectedPath(pathname: string): boolean {
  return pathname === "/practice" || pathname.startsWith("/practice/");
}

export function resolveProtectedRouteRedirect(
  pathname: string,
  isAuthenticated: boolean
): string | null {
  if (isAuthenticated || !isProtectedPath(pathname)) return null;
  return `/sign-in?redirectTo=${encodeURIComponent(pathname)}`;
}

const DEFAULT_NEXT_PATH = "/practice";

// Guards against open-redirect tricks (protocol-relative "//evil.com",
// backslash variants, and domain-suffix tricks like ".evil.com") by only
// ever accepting a single-segment-rooted relative path.
//
// Strips ASCII tab/newline/CR before validating, mirroring the WHATWG URL
// parser's own preprocessing step (it removes those characters from
// *anywhere* in the input, not just the ends). Without this, a value like
// "/\t/evil.com" looks like a single-segment path to a naive prefix check
// but reparses as protocol-relative ("//evil.com") once `new URL()` — or a
// browser's Location handling — actually parses it: a parser-differential
// open redirect.
export function sanitizeNextPath(next: string | null): string {
  if (!next) return DEFAULT_NEXT_PATH;
  const stripped = next.replace(/[\t\n\r]/g, "");
  if (!stripped.startsWith("/")) return DEFAULT_NEXT_PATH;
  if (stripped.startsWith("//") || stripped.startsWith("/\\")) {
    return DEFAULT_NEXT_PATH;
  }
  return stripped;
}
