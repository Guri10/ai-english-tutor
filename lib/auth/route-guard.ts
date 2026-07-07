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
export function sanitizeNextPath(next: string | null): string {
  if (!next) return DEFAULT_NEXT_PATH;
  if (!next.startsWith("/")) return DEFAULT_NEXT_PATH;
  if (next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_NEXT_PATH;
  return next;
}
