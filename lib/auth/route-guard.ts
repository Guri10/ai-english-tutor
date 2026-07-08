const PROTECTED_PREFIXES = ["/practice", "/dashboard"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function resolveProtectedRouteRedirect(
  pathname: string,
  isAuthenticated: boolean
): string | null {
  if (isAuthenticated || !isProtectedPath(pathname)) return null;
  return `/sign-in?redirectTo=${encodeURIComponent(pathname)}`;
}

const DEFAULT_NEXT_PATH = "/practice";

// A fixed, unroutable placeholder origin used only to detect whether `next`
// resolves off-site. Its value never leaves this function.
const SANDBOX_ORIGIN = "http://sanitize-next-path.invalid";

// Guards against open-redirect tricks (protocol-relative "//evil.com",
// backslash variants — special-scheme URLs treat "\" as "/", domain-suffix
// tricks like ".evil.com", and parser-differential tricks like tab/newline/
// CR-interrupted paths) by resolving `next` with the real URL parser against
// a fixed sandbox origin and requiring the result to still be on that origin.
// Delegating to `new URL()` — rather than hand-rolling checks for each
// known bypass — means any future parsing quirk it accounts for is covered
// automatically instead of needing its own special case here.
//
// Only single-segment-rooted paths (starting with exactly one "/") are
// accepted at all; anything else (no leading slash, protocol-relative,
// absolute URLs) falls back to the default rather than being resolved as a
// same-origin path, so the accepted shape stays predictable.
export function sanitizeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/")) return DEFAULT_NEXT_PATH;
  let url: URL;
  try {
    url = new URL(next, SANDBOX_ORIGIN);
  } catch {
    return DEFAULT_NEXT_PATH;
  }
  if (url.origin !== SANDBOX_ORIGIN) return DEFAULT_NEXT_PATH;
  return url.pathname + url.search + url.hash;
}

// Builds the callback URL Supabase redirects to after a magic-link click,
// embedding the (sanitized) post-login destination so the callback route
// can send the user back to where they started.
export function buildAuthCallbackUrl(
  siteUrl: string,
  next: string | null
): string {
  const safeNext = sanitizeNextPath(next);
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}
