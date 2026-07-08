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
6. **Issue #2 (schema + student dashboard read path) — implemented,
   reviewed, applied to the live database.**
   - Migration `supabase/migrations/20260707235642_core_schema.sql`: the 6
     app-owned tables from spec §2, RLS enabled and scoped to `auth.uid()`
     ownership on all of them (`session_transcripts` via its owning
     session's `user_id`). Applied via the Supabase CLI (`supabase link` +
     `supabase db push --linked`) — no CLI login was set up before this
     issue; the user installed it and ran `supabase login` interactively.
   - Dashboard at `/dashboard`, added to `lib/auth/route-guard.ts`'s
     `PROTECTED_PREFIXES`. Reads `student_state`, `recurring_mistakes`,
     and `level_history` (all three, per spec §2 — the first pass missed
     `level_history` and the review caught it) via a TDD'd pure
     shape/fetch split (`lib/dashboard/`), zero/empty state for a
     brand-new user. Linked from `/practice`.
   - Fresh-context code review (high effort, 8-angle, two agents needed a
     retry after an unrelated platform session-limit error) found 9
     issues, all fixed: Supabase query errors were silently swallowed
     (now logged); the dashboard didn't read `level_history` despite the
     issue's own brief calling for it (now does); `getClaims()`-and-
     redirect was duplicated verbatim across `/practice` and `/dashboard`
     (extracted to `lib/auth/require-user-claims.ts`); the CEFR level set
     was hand-duplicated as inline CHECK constraints in 4 places (now one
     shared `cefr_level` Postgres enum); no non-negative guards on
     `student_state`'s counters or `recurring_mistakes.occurrence_count`
     (added); `recurring_mistakes` had no index matching its actual query
     pattern (added); `session_transcripts`' 3 RLS policies duplicated
     the same correlated subquery (extracted to a shared
     `session_owner()` SQL function, `security invoker` — verified
     equivalent access, not a privilege change); the absent DELETE
     policies were undocumented (now a comment explaining it's
     intentional — no delete feature exists yet). A second migration
     (`20260708041341_tighten_core_schema.sql`) carries the schema-level
     fixes; verified clean against both security and performance
     advisors both times. `npm test` (38/38), lint, build all clean.
   - **Issue #2 is closed.**
7. **Issue #3 (session orchestration route + core push-to-talk voice loop)
   — implemented, reviewed, manually verified live, closed.**
   - `OPENAI_API_KEY` added to `.env.local` (server-only, never
     `NEXT_PUBLIC_`) — **not yet added to Vercel**, so production isn't live
     for this feature until that's done (see "Next steps").
   - `openai` npm package (`^6.45.0`) added as a dependency — its shipped
     TypeScript types for `client.realtime.clientSecrets` were used as the
     authoritative source for the Realtime API's request/response shapes
     (nested `session.audio.input/output`, `turn_detection: null` to
     disable server VAD) instead of trusting scraped docs, after web
     search/fetch on the docs site kept returning incomplete/truncated
     JSON schemas.
   - `POST /api/realtime-session`: auth-gated (401 if signed out), reads
     `student_state` + `recurring_mistakes` + `profiles.correction_mode`
     (`lib/realtime/fetch-session-context.ts`), builds a system prompt
     (`lib/realtime/build-system-prompt.ts`, TDD'd), mints an ephemeral
     `ek_...` client secret via `openai.realtime.clientSecrets.create`
     (502 JSON on mint failure, never the raw API key reaching the
     browser).
   - `lib/realtime/session-machine.ts`: the prototype's reducer
     (`prototypes/push-to-talk/machine.ts`) ported in, plus a new
     `STUDENT_TRANSCRIPT` action (the prototype only modeled a placeholder
     string, not real transcribed text) and a narrowed exception allowing
     `RESPONSE_START` from `ready` *only at turn 0* — the tutor's unprompted
     opening greeting. Full vitest suite covering every edge case
     `prototypes/push-to-talk/NOTES.md` verified by hand, now as real
     automated tests.
   - `app/practice/practice-session.tsx`: the client push-to-talk UI.
     WebRTC (`RTCPeerConnection` + `oai-events` data channel) per the
     official WebRTC guide's flow — mic muted (`track.enabled = false`)
     between turns, unmuted only while the button is held, `input_audio_
     buffer.commit` + `response.create` sent explicitly on release (server
     VAD off throughout, matching spec §3). `lib/realtime/map-server-event.ts`
     (TDD'd, pure) maps incoming data-channel events to reducer actions,
     including an `item_id → turn` correlation map so an async input-
     transcription-completed event lands on the right transcript entry even
     if a later turn has already started.
   - `app/practice/actions.ts`'s new `endPracticeSession` server action
     persists a `sessions` row + `session_transcripts` row on session end
     (`lib/realtime/shape-session-end.ts`, TDD'd); `sessions.status` keeps
     its schema default of `pending_summary` since no summarization exists
     yet (issue #4's job).
   - **Manually verified live** (Playwright, real Supabase auth + real
     OpenAI Realtime API, not mocked): full golden path — connect, AI opens
     with a scenario-appropriate spoken greeting unprompted, push-to-talk
     turn (mic down → recording → commit → tutor replies in context), end
     session → "Session saved." persisted. No console errors. (Chromium's
     fake test audio device produces silence/gibberish, so transcribed
     student text was nonsense — expected, not a bug; the *mechanism* — both
     directions of transcript capture, turn-taking, persistence — is what
     was being verified.)
   - Fresh-context code review (high effort, 8-angle) found and fixed real
     bugs, largely converged on independently by 3-4 of the 8 angles: (1)
     `RESPONSE_START`'s turn-0 exception was too broad — it accepted a stray
     greeting-shaped response at *any* turn, and (2) the client sent the
     greeting `response.create` on every reconnect, not just the first
     connect — combined, a mid-session reconnect after a dropped connection
     injected a spurious duplicate tutor turn into the transcript (fixed:
     reducer now gates on `turn === 0` explicitly; client only greets on
     `isFirstConnection`). Also fixed: `CONNECTION_DROPPED` never actually
     closed the peer connection/mic (leaked an open mic until manual
     reconnect); the push-to-talk button had no pointer capture, so
     dragging off it mid-hold left `MIC_UP` never firing (stuck recording
     forever) — added `setPointerCapture` + an `onPointerCancel` fallback;
     `micDown`/`micUp` touched the raw mic track / sent data-channel
     messages even when the corresponding reducer transition would be
     illegal — now pre-checked via `reduce()` itself before any side
     effect; `beginConnection` had no guard against overlapping calls
     (double-click/rapid reconnect) or component-unmount mid-connect, both
     of which could leak a live `RTCPeerConnection` + open mic — fixed via
     an identity-check-against-`pcRef` pattern plus an `isMountedRef`.
     Also deduped: `fetchSessionContext` had copy-pasted `fetch-dashboard-
     data.ts`'s error-logging loop and its own `"A1"` default level literal
     (both now shared: `lib/supabase/log-query-errors.ts`, `lib/level.ts`);
     the OpenAI SDK client was rebuilt from scratch per request (now a
     module-level singleton); `SET_CORRECTION_MODE` was being dispatched
     into the reducer on every `beginConnection` call including reconnects,
     wiring "live" a lock/recap mechanism issue #3 explicitly doesn't need
     yet — `correctionMode` now just travels as plain session metadata
     (`sessionMetaRef`), set once, not routed through the reducer.
     `npm test` (91/91), lint, build all clean; re-verified live in the
     browser after every fix.
   - Also added: `vitest.config.ts` (a bare `@/*` path alias matching
     `tsconfig.json` — needed once route-handler tests started importing
     `@/lib/...`; vitest had no alias resolution configured before this).
   - **Not yet done**: `OPENAI_API_KEY` in Vercel, committing/pushing,
     redeploying to production.

## Not started yet

- Setting `OPENAI_API_KEY` in Vercel (Production + Preview) and deploying
  issue #3's changes — implemented and verified locally/live against real
  Supabase + OpenAI, but not yet live in production.
- Post-session summarization + recap + progress updates — issue #4.
- Correction modes (inline vs. summary) — issue #5. Groundwork already in
  place from issue #3 (`session-machine.ts`'s `recap()`/mode-lock,
  `sessions.correction_mode_used`) but nothing in the model's system prompt
  or the event mapper acts on it yet — `isCorrection` is never set by real
  server events today, so `recap()` is unreachable until #5.
- Error handling wiring (reconnect UX beyond basic drop/reconnect,
  beforeunload sweep, pending_summary retry, daily session cap) — spec §4,
  issue #6.

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
- **Vitest had no `@/*` path alias** even though `tsconfig.json` and every
  `app/`/`lib/` file use it — nothing exercised it in a vitest-run file
  until issue #3's route-handler tests. Fixed once, in `vitest.config.ts`
  (mirrors `tsconfig.json`'s `paths`). No longer an open item, but if a new
  test file mysteriously can't resolve an `@/...` import, this is why it
  used to fail before this file existed.
- **OpenAI Realtime API docs (platform.openai.com/docs/guides/realtime,
  developers.openai.com/api/docs/...) return incomplete/truncated content
  via WebFetch** — the JSON schema tables don't come through. The
  `openai` npm package's shipped `.d.ts` files
  (`node_modules/openai/resources/realtime/{client-secrets,realtime}.d.ts`)
  are the reliable source for exact request/response shapes and were used
  instead for issue #3: ephemeral tokens come from
  `client.realtime.clientSecrets.create({ session: {...} })` (not the
  older two-step `/v1/realtime/sessions` flow); the session config nests
  under `session.audio.{input,output}`; `session.audio.input.turn_detection:
  null` is how push-to-talk disables server VAD; server event type strings
  confirmed from the types: `response.output_audio_transcript.delta`,
  `response.done`, `conversation.item.input_audio_transcription.completed`.

## Next steps

The design spec has been broken into 6 vertical-slice GitHub issues (via
`to-issues`), chained with native blocking dependencies in order:

1. [#1 App scaffold + Supabase magic-link auth](https://github.com/Guri10/ai-english-tutor/issues/1) — **closed**. Blocked by: none.
2. [#2 Schema + student dashboard (read path)](https://github.com/Guri10/ai-english-tutor/issues/2) — **closed**. Blocked by #1
3. [#3 Session orchestration route + core push-to-talk voice loop](https://github.com/Guri10/ai-english-tutor/issues/3) — **closed**. Blocked by #2
4. [#4 Post-session summarization + recap + progress updates](https://github.com/Guri10/ai-english-tutor/issues/4) — `needs-triage`. Blocked by #3
5. [#5 Correction modes (inline vs. summary)](https://github.com/Guri10/ai-english-tutor/issues/5) — `needs-triage`. Blocked by #4
6. [#6 Error handling & reliability](https://github.com/Guri10/ai-english-tutor/issues/6) — `needs-triage`. Blocked by #5

Tests are not a separate trailing issue — each slice's acceptance criteria
includes tests for its own deterministic logic (TDD per slice), per spec §5.

Immediate next step: commit/push issue #3's work, set `OPENAI_API_KEY` in
Vercel, and redeploy — none of that has happened yet this session (see
"Done so far" #7). Then triage #4 from `needs-triage` to `ready-for-agent`
and repeat the implement → review → close cycle.
