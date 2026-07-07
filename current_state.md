# Project state

Read this first if you're a new agent (or human) picking this up. It's a
running log — update it whenever you finish a step, don't rewrite history.

## What this project is

A web platform for friends/family (ages 10+) to practice spoken English with
an AI tutor over voice. Full design: [docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md](docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md).
Stack (per that spec): Next.js on Vercel, Supabase (auth + Postgres), OpenAI
Realtime API for the voice/conversation loop, push-to-talk (no server VAD).

That spec is the source of truth for architecture, data model, and error
handling. Don't duplicate it here — this file just tracks *progress and
setup quirks*, not design decisions.

## Done so far

1. **Design spec** committed: `docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md`.
2. **Issue tracker set up** (via `setup-matt-pocock-skills`): GitHub Issues at
   [Guri10/ai-english-tutor](https://github.com/Guri10/ai-english-tutor) (private repo,
   remote now pushed). PRs are not a triage surface. Default triage label
   vocabulary. Single-context domain docs layout. Config lives in
   `CLAUDE.md` (`## Agent skills` block) + `docs/agents/{issue-tracker,triage-labels,domain}.md`.
   The plan will now come out as GitHub issues (via `to-issues`) instead of
   a single plan doc.
3. **Push-to-talk state machine prototype** (throwaway, per the design spec's
   §5 Testing note): `prototypes/push-to-talk/`
   - `machine.ts` — pure reducer, portable into the real app once validated.
   - `tui.ts` — terminal shell to drive it by hand. Run: `npm run prototype:push-to-talk`.
   - `NOTES.md` — the question being asked and (once driven interactively)
     the answer. **Check this file's "Answer" section before trusting the
     state machine design** — if it's still empty, the prototype hasn't been
     manually verified yet, only scripted-smoke-tested.
   - A scripted smoke test (not committed — was run ad hoc from
     `/private/tmp`) exercised: illegal actions (mic-down before connect,
     double mic-down, mic-down while tutor responding), connection-drop
     mid-turn preserving the transcript, ending a session mid-turn,
     correction-mode locking after turn 1, and inline-vs-summary recap
     behavior. All passed.
   - **Manually verified** (not just scripted-smoke-tested): drove the real
     `tui.ts` via a scripted key-sequence runner and read the actual rendered
     frames against the spec for all five edge-case categories in
     `NOTES.md`'s Question section. All hold up, no bugs found — see
     `prototypes/push-to-talk/NOTES.md`'s Answer section for the writeup.
     One open (non-blocking) product question noted there: after a mid-turn
     connection drop + reconnect, the interrupted turn's transcript entry is
     left frozen/dangling rather than retried — worth a UX call in issue #3.
     **`machine.ts` is now trusted** and safe to fold into the real app.
4. **Design spec broken into 6 GitHub issues** (via `to-issues`), all
   `needs-triage`, chained with native blocking dependencies #1→#2→...→#6.
   See "Next steps" below for the list.
5. **Issue #1 (app scaffold + magic-link auth) — done, not yet closed on the tracker.**
   - Next.js App Router scaffold merged into repo root (Next.js 16.2.10,
     React 19.2.4, Tailwind v4). `package.json`/`tsconfig.json` serve both
     the app and the `tsx` prototype script.
   - `@supabase/ssr` + `@supabase/supabase-js`. Browser/server client
     factories at `lib/supabase/{client,server}.ts`, using a shared
     validated `lib/supabase/env.ts#getSupabaseEnv()` (throws a clear error
     if the env vars are missing, instead of an opaque SDK crash).
   - **`proxy.ts` at repo root** (not `middleware.ts` — Next.js 16 renamed
     the file convention; see Environment quirks) gates `/practice*` via
     `getClaims()`. Redirect decision logic is pure and TDD'd in
     `lib/auth/route-guard.ts` (27 passing tests, vitest): `isProtectedPath`,
     `resolveProtectedRouteRedirect`, `sanitizeNextPath` (open-redirect
     guard — resolves `next` via a real `new URL()` against a fixed sandbox
     origin rather than hand-rolled bypass checks), `buildAuthCallbackUrl`
     (embeds the sanitized post-login return path in the magic-link's
     callback URL).
   - Sign-in page reads `?redirectTo=`, forwards it through the form as a
     hidden field, the server action embeds it in the callback URL — the
     full post-login return-to-where-you-were path is wired end-to-end
     (verified live: `/practice/session-123` while signed out → redirectTo
     survives all the way to the sign-in page's hidden field).
   - `app/auth/callback/route.ts` exchanges the code for a session, logs
     failures (previously silently swallowed), redirects via `next`.
     `app/practice/` is a protected stub (signed-in email + sign-out) —
     becomes the real practice UI in issue #3.
   - **Live infra wired and verified**: real Supabase project
     (`euiqdofazvumnkigoqzf.supabase.co`), magic-link sign-in tested
     end-to-end against it (both locally and confirmed the request/response
     cycle succeeds). Deployed to Vercel — production is
     `https://ai-english-tutor-beta.vercel.app` (project `ai-english-tutor`
     under `atharvas-projects-9b6f5898`; a stray duplicate project
     `ai-english-tutor-hah5` from an earlier misconfigured import was
     found and deleted). `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` are
     all set in Vercel (Production + Preview). Supabase's redirect-URL
     allowlist has both `http://localhost:3000/auth/callback` (keep this —
     local dev needs it) and the production callback URL.
   - **Fresh-context code review done** (high effort, 8-angle multi-agent):
     8 findings, all fixed — dead redirect-return path, swallowed callback
     errors, a matcher gap (image-extension exclusion wasn't scoped to
     `_next/`, would've let a future protected route bypass auth entirely),
     unvalidated env vars, `sanitizeNextPath`'s architecture (now delegates
     to the real URL parser instead of a hand-rolled bypass denylist — this
     is the fix that also closed the redirect-return-path work above),
     duplicated env var access, an inconsistent redirect construction, and
     an accidentally-narrowed `.gitignore` pattern. `npm test` (27/27),
     lint, and build all clean; production redeployed and reverified.
   - **Issue #1 is closed.** One post-close fix needed (see Environment
     quirks): the review's `?next=` addition to the callback URL broke
     Supabase's Redirect URLs match, silently falling back to Site URL —
     fixed in the Supabase dashboard, confirmed resolved by the user.

## Not started yet

- Supabase schema (the 6 tables in spec §2) — issue #2.
- Realtime API session-orchestration route (spec §1, §3) — issue #3.
- Core UI (start practice / push-to-talk mic / end session / recap) — issue #3.
- Post-session summarization + recap + progress updates — issue #4.
- Correction modes (inline vs. summary) — issue #5.
- Error handling wiring (reconnect UX, beforeunload sweep, pending_summary
  retry, daily session cap) — spec §4, issue #6.

## Environment quirks (read before running anything)

- **Shell `PATH` puts an old Node (v10.24.1, via nvm) ahead of a newer one.**
  Plain `node`/`npm`/`npx` on PATH resolve to v10, which is too old for
  `tsx` and breaks `npm` itself (`Cannot find module 'node:path'`). A working
  v23.7.0 exists at `~/.nvm/versions/node/v23.7.0/bin`. Until this is fixed
  in the user's shell profile, prefix commands with:
  ```
  export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
  ```
  This has NOT been fixed at the shell-profile level — every new session
  needs the prefix (or `.claude/settings` needs it baked in) until the user
  sorts out their nvm default.
- `package.json`/`tsconfig.json` at repo root now serve both the Next.js app
  and the `tsx` prototype script (merged as part of issue #1) — no longer an
  open item.
- **Next.js 16 renamed `middleware.ts` → `proxy.ts`** (function `middleware`
  → `proxy`). A leftover `middleware.ts` is silently ignored at build time
  with no error — auth/redirect logic would just stop running and protected
  routes would become publicly reachable. This repo correctly uses
  `proxy.ts`; if anything ever references "middleware", treat it as stale
  and check `proxy.ts` instead.
- **The `preview_start` dev-server tool's spawn environment breaks Turbopack
  in this project.** `next dev`'s default Turbopack compiler spawns an
  internal Node subprocess (for CSS/PostCSS loader evaluation) that fails
  under the preview tool's sandbox with `node: --enable-source-maps is not
  allowed in NODE_OPTIONS` (exit status 9) — `next build` and running
  `next dev` directly via a plain shell are both unaffected, this is
  specific to that tool's spawned environment. Fixed by passing
  `--disable-source-maps` (a real `next dev` flag) in
  `.claude/launch.json`'s command, combined with the existing PATH prefix
  (also needed there since `runtimeExecutable` doesn't inherit a fixed
  shell profile). `.claude/launch.json`'s `dev` config already has both
  fixes baked in — just use `preview_start` normally, no need to re-derive
  this.
- **Supabase's Redirect URLs allowlist entries need a wildcard, not an
  exact match.** After the code review added a `?next=<path>` query string
  to the magic-link callback URL (`buildAuthCallbackUrl` in
  `lib/auth/route-guard.ts`), the exact-match Redirect URL entries added
  earlier (bare `.../auth/callback`) stopped matching. Supabase doesn't
  error in this case — it silently falls back to the Site URL setting
  instead, which is easy to misdiagnose (symptom: the magic link lands on
  the bare Site URL root with just `?code=...`, no `/auth/callback` path,
  e.g. `http://localhost:3000/?code=...` if Site URL was left at its
  project-creation default). Fixed by changing both Redirect URL entries to
  `.../auth/callback**` (wildcard suffix) and setting Site URL to the
  production URL instead of leaving it at the localhost default. If any
  future change alters the callback URL's query string shape again,
  re-check this.

## Next steps

The design spec has been broken into 6 vertical-slice GitHub issues (via
`to-issues`), chained with native blocking dependencies in order:

1. [#1 App scaffold + Supabase magic-link auth](https://github.com/Guri10/ai-english-tutor/issues/1) — `ready-for-agent`, **implementation + review done, not yet closed** (see "Done so far" #5). Blocked by: none.
2. [#2 Schema + student dashboard (read path)](https://github.com/Guri10/ai-english-tutor/issues/2) — `needs-triage`. Blocked by #1
3. [#3 Session orchestration route + core push-to-talk voice loop](https://github.com/Guri10/ai-english-tutor/issues/3) — `needs-triage`. Blocked by #2. Folds the now-trusted `machine.ts` into the real app.
4. [#4 Post-session summarization + recap + progress updates](https://github.com/Guri10/ai-english-tutor/issues/4) — `needs-triage`. Blocked by #3
5. [#5 Correction modes (inline vs. summary)](https://github.com/Guri10/ai-english-tutor/issues/5) — `needs-triage`. Blocked by #4
6. [#6 Error handling & reliability](https://github.com/Guri10/ai-english-tutor/issues/6) — `needs-triage`. Blocked by #5

Tests are not a separate trailing issue — each slice's acceptance criteria
includes tests for its own deterministic logic (TDD per slice), per spec §5.

Immediate next step: close issue #1 (implemented, fresh-context-reviewed,
fixes applied and deployed — see "Done so far" #5). Then triage #2 from
`needs-triage` to `ready-for-agent` and repeat the implement → review →
close cycle.
