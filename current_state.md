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
5. **Issue #1 (app scaffold + magic-link auth) — in progress.** Triaged to
   `ready-for-agent` with an agent brief posted. Implemented with TDD so far:
   - Next.js App Router scaffold merged into repo root (Next.js 16.2.10,
     React 19.2.4, Tailwind v4). `package.json`/`tsconfig.json` now serve
     both the app and the `tsx` prototype script — both verified working.
   - `@supabase/ssr` + `@supabase/supabase-js` installed. Browser/server
     client factories at `lib/supabase/{client,server}.ts`, following
     current Supabase SSR conventions (`getAll`/`setAll` cookies,
     `getClaims()` for auth checks — never `getSession()` server-side).
   - **`proxy.ts` at repo root** (not `middleware.ts` — Next.js 16 renamed
     the file convention; see Environment quirks below) gates `/practice`.
     The redirect *decision* logic is pure and TDD'd:
     `lib/auth/route-guard.ts` + its test (10 passing tests, vitest).
   - Sign-in page (`app/sign-in/`) with a magic-link request form
     (`useActionState` + a server action). Callback route
     (`app/auth/callback/route.ts`) exchanges the code for a session.
     `app/practice/` is a protected stub (shows signed-in email + sign-out)
     — will become the real practice UI in issue #3.
   - Verified locally: `npm test` (10/10 pass), `npm run lint` (clean),
     `npm run build` (succeeds — `/` and `/sign-in` static, `/practice` and
     `/auth/callback` dynamic, Proxy registered), dev server manually
     checked (landing page renders, sign-in form renders, `/practice`
     307-redirects to `/sign-in?redirectTo=%2Fpractice` when signed out),
     prototype script still runs.
   - **Not yet done**: no live Supabase project exists, so magic-link
     sign-in has never actually been exercised end-to-end, and nothing is
     deployed to Vercel. `.env.local` currently holds placeholder values
     (`https://placeholder.supabase.co`) just to unblock local dev/build —
     **these are not real credentials**. Blocked on the user creating a
     Supabase project + connecting a Vercel project (they've been given
     the exact steps); once they hand over the real
     `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
     swap them into `.env.local` (local) and Vercel's project env vars
     (deployed), then verify the real magic-link flow and close out issue
     #1's remaining acceptance criteria.

## Not started yet

- The rest of issue #1 (live Supabase project, live Vercel deploy — see above).
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

## Next steps

The design spec has been broken into 6 vertical-slice GitHub issues (via
`to-issues`), chained with native blocking dependencies in order:

1. [#1 App scaffold + Supabase magic-link auth](https://github.com/Guri10/ai-english-tutor/issues/1) — `ready-for-agent`, **in progress** (see "Done so far" #5). Blocked by: none.
2. [#2 Schema + student dashboard (read path)](https://github.com/Guri10/ai-english-tutor/issues/2) — `needs-triage`. Blocked by #1
3. [#3 Session orchestration route + core push-to-talk voice loop](https://github.com/Guri10/ai-english-tutor/issues/3) — `needs-triage`. Blocked by #2. Folds the now-trusted `machine.ts` into the real app.
4. [#4 Post-session summarization + recap + progress updates](https://github.com/Guri10/ai-english-tutor/issues/4) — `needs-triage`. Blocked by #3
5. [#5 Correction modes (inline vs. summary)](https://github.com/Guri10/ai-english-tutor/issues/5) — `needs-triage`. Blocked by #4
6. [#6 Error handling & reliability](https://github.com/Guri10/ai-english-tutor/issues/6) — `needs-triage`. Blocked by #5

Tests are not a separate trailing issue — each slice's acceptance criteria
includes tests for its own deterministic logic (TDD per slice), per spec §5.

Immediate next step: get real Supabase/Vercel credentials from the user (see
"Done so far" #5's last bullet), verify the live magic-link flow and
deployment, then code-review issue #1 in a fresh context before closing it.
Then triage #2 from `needs-triage` to `ready-for-agent` and repeat.
