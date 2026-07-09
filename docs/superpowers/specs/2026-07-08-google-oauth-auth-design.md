# Google OAuth Auth — Design

Date: 2026-07-08

## Purpose

Replace magic-link (passwordless email) auth with Google OAuth as the sole sign-in method.

**Motivation:** Supabase's built-in email service hard-caps outgoing auth emails at 2/hour, and this limit can only be raised by configuring custom SMTP. That cap doesn't just block testing — it would also throttle real friends/family users signing in around the same time in production. Google OAuth sidesteps email delivery (and its rate limit) entirely, since no email is sent as part of sign-in.

**Supersedes:** the original design spec's Auth/DB line ([2026-07-07-ai-speaking-practice-design.md](2026-07-07-ai-speaking-practice-design.md#L21)), which specified magic-link auth. That line is now out of date; this document is the current source of truth for the auth method.

## Decision

- **Full replacement, not additive.** Magic-link auth is removed entirely — Google is the only sign-in method. No fallback path is being kept for users without a Google account.
- **Google only**, no other OAuth providers (e.g. Apple). This is a small, trusted friends/family user base; Google covers effectively everyone in it, and a second provider (Apple in particular, which needs a separate paid developer account) isn't worth the setup cost for that audience.
- **Under-13 Google account restrictions are an explicit non-goal for now.** Some users are ages 10+ per the original spec, and Google accounts for under-13s are often parent-managed (Family Link) or restricted. This is being treated as acceptable for the current friends/family testing phase; revisit only if it actually blocks someone from signing in.

## Architecture / components

- **`app/sign-in/sign-in-form.tsx`** — replaces the email-input form with a single "Sign in with Google" button. No server action: the client directly calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`, which itself performs the browser redirect to Google's consent screen. This needs to run client-side because `redirectTo` is built from `window.location.origin` (see Data flow).
- **`app/sign-in/actions.ts`** — deleted (`requestMagicLink`, `MagicLinkState` no longer needed).
- **`app/auth/callback/route.ts`** — **unchanged**. It already does `exchangeCodeForSession(code)` and redirects on `next`/error; that logic is provider-agnostic and works identically for an OAuth authorization code as it did for magic-link's.
- **`lib/auth/route-guard.ts`** — `sanitizeNextPath` and `buildAuthCallbackUrl` are kept as-is. `buildAuthCallbackUrl`'s `siteUrl` argument is now `window.location.origin` at call time instead of the `NEXT_PUBLIC_SITE_URL` env var.
- **`app/sign-in/page.tsx`** — copy update ("Sign in with Google" instead of the magic-link explanation text).
- **`NEXT_PUBLIC_SITE_URL`** — removed from `.env.local`, `.env.example`, and Vercel (Production + Preview) once nothing references it.
- **External setup (manual, outside this codebase):** a Google OAuth Client ID/Secret must be created in Google Cloud Console and configured in Supabase Dashboard → Authentication → Providers → Google. Not automatable from this repo.
- **Schema/RLS/`profiles`/dashboard code:** untouched. `auth.uid()` is identical regardless of provider, so no data-model changes are needed.

## Data flow

1. User clicks "Sign in with Google" on `/sign-in`. Client calls:
   ```
   supabase.auth.signInWithOAuth({
     provider: "google",
     options: { redirectTo: buildAuthCallbackUrl(window.location.origin, redirectToParam) }
   })
   ```
2. Browser redirects to Google's consent screen, then back through Supabase, then to `<origin>/auth/callback?code=...&next=...` — `<origin>` is whatever domain the user actually started from (dynamic, not a fixed env var).
3. The existing callback route exchanges the code for a session and redirects to `next` (defaults to `/practice`, unchanged from today).

**Why dynamic origin instead of a fixed `NEXT_PUBLIC_SITE_URL`:** this is what caused the original bug report this design responds to — a fixed site URL meant a magic link requested from one Vercel domain redirected to a different domain, where the PKCE code-verifier cookie (scoped to the originating domain) didn't exist, breaking `exchangeCodeForSession`. Building `redirectTo` from `window.location.origin` at click time means the user always lands back on the same domain they started from, eliminating that class of bug. Supabase's own dashboard-configured Redirect URLs allowlist still bounds what's accepted server-side, so this isn't an open-redirect risk — it just removes the single-fixed-domain assumption.

## Error handling

- Google consent denied, or `exchangeCodeForSession` fails for any reason → same existing fallback: redirect to `/sign-in?error=auth-callback-failed`. No new error branch needed; the callback route already treats "no valid code" generically.
- **Supabase Dashboard Redirect URLs allowlist** needs an update: it currently has `localhost:3000/auth/callback**` and the `beta` production domain wildcard. Add the Vercel default project domain (`https://ai-english-tutor-atharvas-projects-9b6f5898.vercel.app/auth/callback**`) too, since the dynamic-origin approach means that domain now needs to be pre-approved for redirects to succeed from it. Ad-hoc per-deployment preview URLs (unique hash per deploy) remain un-allowlist-able — this is a pre-existing limitation, not one introduced by this change.

## Testing

- `sanitizeNextPath`/`buildAuthCallbackUrl` keep their existing unit tests — still pure functions, only ever fed a different origin string, no behavior change to test.
- The OAuth handshake itself (real Google consent screen) isn't unit-testable — manually verified live in the browser, consistent with how the original magic-link flow (issue #1) and the Realtime API flow (issue #3) were verified.
- Any tests tied to `requestMagicLink`/`MagicLinkState` are deleted along with the code they test.

## Non-goals

- No ADR/CONTEXT.md infrastructure is being created for this change — none exists yet in this repo (created lazily per `docs/agents/domain.md`), and this design doc itself is the record of the decision.
- No fallback sign-in path for users without Google access.
- No changes to `profiles`, `student_state`, `level_history`, `recurring_mistakes`, `sessions`, or `session_transcripts` — auth method is orthogonal to the data model.
