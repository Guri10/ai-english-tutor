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
