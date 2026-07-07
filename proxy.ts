import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveProtectedRouteRedirect } from "@/lib/auth/route-guard";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
    }
  );

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
