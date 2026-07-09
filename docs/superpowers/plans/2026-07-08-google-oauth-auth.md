# Google OAuth Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace magic-link (passwordless email) auth with Google OAuth as the sole sign-in method.

**Architecture:** The sign-in form becomes a client component that calls `supabase.auth.signInWithOAuth({ provider: "google" })` directly (no server action), building the callback redirect URL from the browser's own `window.location.origin` instead of a fixed env var. `app/auth/callback/route.ts` needs no changes — its `exchangeCodeForSession` logic is already provider-agnostic.

**Tech Stack:** Next.js App Router, `@supabase/ssr` (`createBrowserClient`), existing `lib/auth/route-guard.ts` helpers.

**Spec:** [docs/superpowers/specs/2026-07-08-google-oauth-auth-design.md](../specs/2026-07-08-google-oauth-auth-design.md)

## Global Constraints

- Node: use `export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"` before any `npm`/`npx` command in this shell (see `current_state.md` Environment quirks — plain `node`/`npm` on PATH resolve to a broken v10).
- Google OAuth provider is already enabled in Supabase Dashboard (Sign In / Providers → Google), and Redirect URLs already include `localhost:3000`, the `beta` prod domain, and the Vercel default project domain, all with the `/auth/callback**` wildcard suffix — this was done manually outside the codebase before this plan, no code task needed for it.
- No new pure logic is being introduced by this change (`sanitizeNextPath`/`buildAuthCallbackUrl` are unchanged, just called with a different origin string at their existing call site), so there's no new unit test to write TDD-style — this matches the design spec's own Testing section. The OAuth handshake itself is verified live in the browser, not via automated test, consistent with how this repo verified the original magic-link flow and the Realtime API flow.

---

## Task 1: Replace the sign-in form with Google OAuth

**Files:**
- Delete: `app/sign-in/actions.ts`
- Modify: `app/sign-in/sign-in-form.tsx` (full rewrite)
- Modify: `app/sign-in/page.tsx:14` (copy only)

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/client.ts` (existing, `createBrowserClient(url, publishableKey)` — no changes needed there), `buildAuthCallbackUrl(siteUrl: string, next: string | null): string` from `lib/auth/route-guard.ts` (existing, unchanged).
- Produces: `SignInForm({ redirectTo }: { redirectTo?: string })` — same prop shape as before, so `app/sign-in/page.tsx`'s existing `<SignInForm redirectTo={redirectTo} />` call site doesn't need to change.

- [ ] **Step 1: Delete the magic-link server action**

```bash
git rm app/sign-in/actions.ts
```

- [ ] **Step 2: Rewrite the sign-in form as a Google OAuth button**

Replace the full contents of `app/sign-in/sign-in-form.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/lib/auth/route-guard";

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildAuthCallbackUrl(
          window.location.origin,
          redirectTo ?? null
        ),
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={pending}
        className="rounded-full bg-foreground px-6 py-3 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Redirecting…" : "Sign in with Google"}
      </button>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
```

(On success, `signInWithOAuth` redirects the browser away before any state update matters — `pending`/`error` state only matters for the synchronous-error case, e.g. the provider not being enabled.)

- [ ] **Step 3: Update the sign-in page copy**

In `app/sign-in/page.tsx`, replace:

```tsx
        Enter your email and we&apos;ll send you a magic link to sign in.
```

with:

```tsx
        Sign in with your Google account to get started.
```

- [ ] **Step 4: Run the existing test suite (regression check)**

```bash
export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
npm test
```

Expected: all existing tests pass unchanged (`lib/auth/route-guard.test.ts` covers `buildAuthCallbackUrl`/`sanitizeNextPath` directly and isn't affected by this task's changes).

- [ ] **Step 5: Lint and build**

```bash
export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
npm run lint
npm run build
```

Expected: both clean. The build step also confirms `app/sign-in/actions.ts` isn't imported anywhere else (it would fail to resolve the import if so).

- [ ] **Step 6: Commit**

```bash
git add app/sign-in/sign-in-form.tsx app/sign-in/page.tsx
git commit -m "$(cat <<'EOF'
Replace magic-link sign-in with Google OAuth

Supabase's built-in email service caps auth emails at 2/hour with no
way to raise it short of custom SMTP. Google OAuth sidesteps email
delivery entirely, and the callback redirect now derives from
window.location.origin instead of a fixed site-URL env var, which
also fixes the cross-domain PKCE-cookie failure the old flow hit when
testing from a non-canonical Vercel domain.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove the now-unused site-URL env var and verify live

**Files:**
- Modify: `.env.local:3` (remove the `NEXT_PUBLIC_SITE_URL` line)
- Modify: `.env.example:3` (remove the `NEXT_PUBLIC_SITE_URL` line)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only removes a now-dead env var and confirms the end-to-end flow live.

- [ ] **Step 1: Confirm nothing else references the env var**

```bash
grep -rn "NEXT_PUBLIC_SITE_URL" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v .next
```

Expected: no output (Task 1 already deleted the only code reference, `app/sign-in/actions.ts`).

- [ ] **Step 2: Remove the line from `.env.local`**

Delete the line:
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 3: Remove the line from `.env.example`**

Delete the line:
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 4: Remove the Vercel env var (Production and Preview)**

This modifies shared/deployed project config — confirm with the user before running, since it's not a purely local change:

```bash
vercel env rm NEXT_PUBLIC_SITE_URL production
vercel env rm NEXT_PUBLIC_SITE_URL preview
```

- [ ] **Step 5: Commit the local env file changes**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
Remove unused NEXT_PUBLIC_SITE_URL env var

No longer referenced now that the OAuth callback URL is built from
window.location.origin instead of a fixed site-URL env var.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(`.env.local` is gitignored — only `.env.example` needs committing.)

- [ ] **Step 6: Redeploy to production**

```bash
vercel --prod
```

- [ ] **Step 7: Manually verify live, across domains**

In a browser:
1. Go to `https://ai-english-tutor-beta.vercel.app/sign-in` → click "Sign in with Google" → complete Google's consent screen → confirm you land back on `/practice`, signed in.
2. Sign out. Go to `https://ai-english-tutor-atharvas-projects-9b6f5898.vercel.app/sign-in` → click "Sign in with Google" → confirm you land back on that **same** domain's `/practice`, signed in (this is the case that was broken before this change).
3. Check the browser console on both for errors.
4. Confirm `redirectTo` survives: while signed out, visit `.../practice/some-path`, get redirected to sign-in, sign in with Google, confirm you land back on `.../practice/some-path` rather than the default `/practice`.

Record the result in `current_state.md` once verified (per this repo's existing progress-log convention).
