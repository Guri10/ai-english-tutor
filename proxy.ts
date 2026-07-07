import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveProtectedRouteRedirect } from "@/lib/auth/route-guard";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims() verifies the JWT signature every call; getSession() does
  // not and must never be trusted here (see Supabase's SSR auth guide).
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const redirectTo = resolveProtectedRouteRedirect(
    request.nextUrl.pathname,
    isAuthenticated
  );
  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  return response;
}

export const config = {
  // No extension-based exclusion here on purpose: a blanket "skip anything
  // ending in .png/.svg/etc" would also skip a future route under a
  // protected prefix that happens to end in one of those extensions (e.g.
  // /practice/export.png), silently bypassing auth for it. _next/static and
  // _next/image already cover Next's own asset serving.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
