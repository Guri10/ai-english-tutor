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
8. **Magic-link auth replaced with Google OAuth — implemented, reviewed,
   deployed, verified live. Supersedes issue #1's magic-link auth** (see
   `docs/superpowers/specs/2026-07-08-google-oauth-auth-design.md`, which
   is now the source of truth for the auth method — the original design
   spec's "magic-link" line is out of date).
   - **Why**: Supabase's built-in email service hard-caps auth emails at
     2/hour with no way to raise it short of custom SMTP — this was
     blocking manual testing and would have throttled real friends/family
     users signing in around the same time in production.
   - `app/sign-in/actions.ts` (`requestMagicLink`, `MagicLinkState`)
     deleted. `app/sign-in/sign-in-form.tsx` is now a client component
     that calls `supabase.auth.signInWithOAuth({ provider: "google" })`
     directly, building the callback redirect URL from
     `window.location.origin` at click time (via the existing
     `buildAuthCallbackUrl`) instead of a fixed env var.
     `app/auth/callback/route.ts` needed no changes — its
     `exchangeCodeForSession` logic was already provider-agnostic.
   - **This also fixed a real bug**: the old fixed-`NEXT_PUBLIC_SITE_URL`
     approach meant a sign-in started from one Vercel domain (e.g. the
     project's auto-generated default domain) redirected to a different
     domain (the `beta` custom alias), where the PKCE code-verifier
     cookie — scoped to the originating domain — didn't exist, breaking
     `exchangeCodeForSession` (`?error=auth-callback-failed`). Deriving
     the redirect from `window.location.origin` means the user always
     lands back on the domain they started from.
   - `NEXT_PUBLIC_SITE_URL` is fully removed — deleted from `.env.local`,
     `.env.example`, and Vercel (Production + Preview). No longer set,
     unlike what an earlier entry in this log (issue #1, above) says was
     configured at the time — that was correct when written, this
     supersedes it.
   - **External/manual setup done in Google Cloud Console + Supabase
     Dashboard** (not in this repo): Google OAuth Client ID/Secret
     created, Google provider enabled in Supabase (Sign In / Providers),
     Redirect URLs allowlist extended to cover the Vercel default project
     domain in addition to `localhost` and the `beta` domain (all with the
     `/auth/callback**` wildcard suffix — see the existing Environment
     quirks entry below on why the wildcard matters).
   - Fresh code review (per-task + final whole-branch, subagent-driven)
     found one real edge case: `signInWithOAuth` was only handled for its
     returned-error case, not a thrown/rejected promise (e.g. a network
     failure), which would've left the sign-in button stuck on
     "Redirecting…" forever with no error shown — fixed with a
     `try/catch`. Also fixed a stale doc comment in
     `lib/auth/route-guard.ts` still referencing "magic-link click".
     `npm test` (91/91), lint, and build all clean.
   - **Manually verified live** by the user across both production
     domains (`ai-english-tutor-beta.vercel.app` and the Vercel default
     `ai-english-tutor-atharvas-projects-9b6f5898.vercel.app` domain,
     confirming the cross-domain fix), plus the `redirectTo` round-trip
     through a real protected route (`/dashboard`) while signed out.
   - `OPENAI_API_KEY` has since been set in Vercel (Production + Preview) —
     confirmed via `vercel env ls`. Issue #3's changes are live in production.
9. **Issue #4 (post-session summarization + recap + progress updates) —
   implemented, reviewed, manually verified live, closed.**
   - `lib/summarization/`: `session-summary-schema.ts` (zod schema —
     `levelScore` CEFR enum, `topicsCovered`, `mistakes[]` of
     type/example/correction), `build-summarization-prompt.ts` (TDD'd, pure),
     `summarize-session.ts` (thin `openai.chat.completions.parse` +
     `zodResponseFormat` wrapper — the mocked network boundary in tests),
     `apply-summary.ts` (TDD'd, pure — the one function that turns a
     `SessionSummary` + current `student_state` snapshot into the exact
     `sessions`/`level_history`/`recurring_mistakes`/`student_state` row
     updates, including the daily-streak rule: same UTC calendar day as
     `last_session_at` leaves `streak_count` unchanged, exactly one day
     later increments it, any bigger gap or a first-ever session resets it
     to 1 — chosen over a plain per-session counter after asking the user).
   - `zod` promoted from a transitive (`openai`) dependency to a direct one.
   - `app/practice/actions.ts`'s `endPracticeSession` now, after persisting
     the session + transcript as before: runs `summarizeSession()` (skipped
     entirely for a zero-exchange transcript, which instead flows through
     `applySummary` as a trivial no-op summary so it still counts toward
     `total_sessions`/streak), reads current `student_state` +
     `recurring_mistakes` in parallel with that OpenAI call, computes the
     updates via `applySummary`, and writes all four tables in one
     `Promise.all` (a single batched `recurring_mistakes` upsert, not one
     per mistake type). Returns a recap payload (`status: "completed"` with
     level/streak/mistakes, or `"pending_summary"`) instead of the old bare
     `{ok:true}`.
   - `app/practice/practice-session.tsx`'s "ended" screen now renders that
     recap (level-before → level-after, streak, mistakes list) via a new
     `Recap` component, replacing the old flat "Session saved." message.
     Since `correction_mode` isn't wired into model behavior yet (issue #5),
     the recap unconditionally shows mistakes — this slice's recap *is* the
     eventual "summary mode" recap.
   - **Manually verified live** (Playwright, real Google OAuth + real
     OpenAI Realtime voice session + real OpenAI summarization call, not
     mocked): full golden path twice (before and after the review's fixes)
     — start practice, one push-to-talk turn, end session, recap renders
     the correct level/streak/mistakes, no console or server errors.
   - Fresh-context code review (high effort, 8 finder angles) converged
     independently (5-6 of 8 angles) on one serious bug cluster, now fixed:
     `endPracticeSession` treated a `student_state`/`recurring_mistakes`
     **read error** the same as "no row yet" and would have silently reset
     an existing user's real progress to brand-new-user defaults before
     upserting over their actual row; separately, **write failures** across
     the four tables were only logged, never checked, so the function
     always returned `status: "completed"` with the freshly *computed*
     level/streak even if nothing had actually persisted, showing the
     student a recap that lied about what was saved. Both now abort to the
     same `pending_summary` "still processing" response the UI already
     handled, rather than risk corrupting or misreporting state. Also
     fixed: the empty-transcript fast path force-cast the client-supplied
     `levelBefore` straight into `student_state.level_score` with no
     validation (now falls back to `DEFAULT_LEVEL_SCORE` if it isn't a real
     CEFR code); N+1 `recurring_mistakes` upserts (now one batched call);
     the `student_state`/`recurring_mistakes` reads were needlessly
     serialized after the multi-second OpenAI call instead of running
     concurrently with it (now parallelized). `npm test` (117/117), lint,
     and build all clean; re-verified live after the fixes.
   - **Known, deliberately deferred limitation**: `endPracticeSession` does
     a non-transactional read-modify-write of `student_state` with no
     locking — two concurrent session-ends for the same user (double tab,
     retried request) can race and lose one session's worth of progress.
     Fixing this properly needs a DB-side atomic operation (a Postgres
     RPC/stored procedure), which is a bigger architectural change than
     this slice's scope — worth picking up alongside issue #6's background
     `pending_summary` retry job, which will need the same atomic update.

9. **Issue #5 (correction modes: inline vs. summary) — implemented, reviewed,
   manually verified live, closed.**
   - **Key design decision (asked the user)**: how does the app know a
     tutor's spoken reply included a live correction? Chose "the model
     calls a tool" over "just hide the mistake list in inline mode" — the
     Realtime API supports function/tool calls alongside spoken audio in
     the same turn, giving exact detection plus structured mistake data,
     at the cost of new integration surface.
   - `lib/realtime/session-machine.ts`: new `FLAG_CORRECTION_TOOL_NAME`
     constant (shared by the route, prompt, and event mapper — closes a
     3-way string-literal duplication a review angle flagged), new
     `CORRECTION_FLAGGED` action (phase-gated like its `RESPONSE_TEXT_CHUNK`
     sibling, tags the current turn's tutor entry `isCorrection: true`),
     new `isCorrectionMode()` type guard. Removed `pendingMistakes`/
     `MistakeNote`/`recap()` — prototype-era concepts that assumed the recap
     would be computed client-side; the real recap is server-computed
     (issue #4), so these were dead code, not wired up.
   - `lib/realtime/build-system-prompt.ts`: `correctionMode` is now a
     required input — inline mode instructs the model to correct briefly
     in-voice and silently call the tool; summary mode instructs it to
     never correct mid-conversation.
   - `app/api/realtime-session/route.ts`: reads an optional `correctionMode`
     override from the POST body (validated, falls back to the profile
     default), registers the `flag_correction` function tool on the
     Realtime session only for inline mode.
   - `app/practice/page.tsx` / `practice-session.tsx`: a pre-session toggle
     (locks once the first turn happens, reusing `session-machine.ts`'s
     already-validated lock instead of reinventing it) seeds the reducer
     and is sent as the override; a `flag_correction` tool-call event sends
     a `function_call_output` back over the data channel (guarded on
     `call_id` actually being a string) so the call doesn't dangle
     unanswered, without triggering an extra spoken turn.
   - `app/practice/actions.ts`: `endPracticeSession` now returns a
     `correctedLiveCount` (count of `isCorrection`-tagged transcript
     entries) alongside `mistakes: []` for inline mode — the recap
     distinguishes "corrected N things live" from genuinely "no mistakes,"
     rather than blanket-hiding both identically (a review angle caught
     that the first cut of this made every inline session look
     mistake-free regardless of what actually happened). `recurring_
     mistakes`/`level_history`/`student_state` writes are unaffected by
     correction mode either way.
   - New `lib/realtime/fetch-default-correction-mode.ts` (TDD'd), extracted
     out of `fetch-session-context.ts` and reused by both — `page.tsx` was
     running the full 3-query `fetchSessionContext` just to read one field
     for the toggle's default until a review angle caught it.
   - **Manually verified live** (Playwright, real Google OAuth + real
     OpenAI Realtime, not mocked): both modes end-to-end — toggle switches
     correctly, the resolved mode round-trips through `/api/realtime-session`,
     the `flag_correction` tool registers successfully with the real API
     for inline mode (no mint failure) and is absent for summary mode, both
     recaps render with no console/server errors. Actually triggering a
     real `flag_correction` call couldn't be forced live (fake test-audio
     mic produces no real mistakes to correct) — same limitation issue #3
     hit; the mechanism itself is unit-tested (reducer, event mapper,
     route) rather than exercised end-to-end with real speech.
   - Fresh-context code review (high effort, 8 finder angles) found and
     fixed: `call_id` sent back unvalidated when acking a tool call (now
     guarded); `CORRECTION_FLAGGED` was the only transcript-mutating
     reducer case missing the phase guard its siblings have (could have
     mistagged a later turn's entry on a stray/delayed event); the
     `flag_correction` name duplicated across 3 files with no shared
     constant; the inline-recap blanket-suppression bug described above;
     the double-`fetchSessionContext` fix described above; toggle buttons
     duplicated with inconsistent hover styling; `CORRECTION_FLAGGED` used
     a different transcript-mutation idiom than its `RESPONSE_TEXT_CHUNK`
     sibling. `npm test` (133/133), lint, and build all clean; re-verified
     live after the fixes.
   - **Known, deliberately not fixed**: the `flag_correction` tool's
     structured arguments (mistake type/example/correction) are generated
     by the model but never read anywhere — only the tool call's
     *occurrence* is used (to tag `isCorrection` and compute
     `correctedLiveCount`). Wiring up the full structured data would let a
     future issue show exactly *what* was corrected live, not just a count
     — a reasonable follow-up, not required by #5's acceptance criteria.

10. **Issue #6 (error handling & reliability) — implemented, reviewed,
    manually verified live, closed. Last issue in the 6-issue chain.**
    - **Key design decision (asked the user)**: how to trigger the 15-minute
      sweep / `pending_summary` retry job on a schedule. Chose Supabase
      `pg_cron` + `pg_net` over Vercel Cron — this project is on Vercel's
      free Hobby plan (confirmed with the user), where Cron Jobs only run
      once/day, too coarse for a 15-minute sweep. `pg_cron` schedules a
      `net.http_post` to `/api/cron/session-maintenance` every 10 minutes,
      authenticated via a `CRON_SECRET` bearer token stored in Supabase
      Vault (`select vault.create_secret(...)`, run once outside git).
    - **Session lifecycle moved earlier**: `sessions` rows are now created
      at connect time (`POST /api/realtime-session`, `status: 'active'`)
      instead of only at session end — a server-side sweep needs a row to
      find. `lib/realtime/resolve-active-session.ts` reuses the same row on
      a reconnect (dropped WebSocket) instead of starting a second one.
    - New heartbeat endpoint (`app/api/practice-sessions/[id]/sync/route.ts`)
      syncs the transcript and bumps `last_activity_at` — called after each
      completed tutor turn and from a `beforeunload`/`visibilitychange`
      handler via `navigator.sendBeacon` (the client-side best-effort
      close-and-save spec §4 asks for).
    - `lib/realtime/finalize-session.ts`: extracted shared summarize →
      apply → write logic, used by both `endPracticeSession` (normal end)
      and the new maintenance route's sweep/retry passes
      (`lib/realtime/run-session-maintenance.ts`). Summarization itself
      retries with backoff (`lib/summarization/summarize-session-with-retry.ts`)
      before falling back to `pending_summary`.
    - Daily per-user session cap (`lib/realtime/check-daily-session-cap.ts`,
      default 10/day via `DAILY_SESSION_CAP` env var), checked in
      `/api/realtime-session` before minting a token; skipped for
      reconnects (see review fix below).
    - Client: denied mic permission now gets a distinct, clear message
      instead of a generic connect-failure one.
    - **Found and fixed while reading the code for the Agent Brief**: the
      OAuth callback route already redirected to
      `/sign-in?error=auth-callback-failed` on a failed/expired code
      exchange, but nothing ever read that query param — the error was
      silently dropped. `app/sign-in/page.tsx`/`sign-in-form.tsx` now
      display it.
    - Fresh-context code review (high effort) found and fixed two real
      races: (1) the sweep and a normal session end (or two overlapping
      sweep runs) could both finalize the same session, duplicating
      `level_history` and inflating `total_sessions`/streak — fixed via an
      atomic claim (`finalizeSession` flips the row to a new transient
      `finalizing` status before doing any work; losing the claim returns
      `skipped` and does nothing further; the sweep's claim also
      optimistically re-checks `last_activity_at` so a heartbeat that
      revives a session mid-sweep correctly aborts the finalize instead of
      cutting off a live session); (2) the daily cap counted the
      in-progress session itself, so a student on their 10th session of the
      day who hit a dropped connection would get blocked from
      reconnecting — fixed by skipping the cap check for reconnects.
      `npm test` (178/178), lint, and build all clean after the fixes.
    - **Manually verified live** (Playwright, real Google OAuth + real
      OpenAI Realtime + real Supabase, nothing mocked): full golden path —
      start practice (daily-cap check passes, `active` row created), tutor's
      opening greeting streams in and the heartbeat immediately syncs it
      server-side, end session → summarized → recap renders → DB row
      transitions to `completed` with `ended_at` set. Also confirmed live:
      sign-in page shows the auth-callback error; the deployed maintenance
      route correctly 401s unauthenticated/wrong-secret requests; the
      `pg_cron` job is scheduled and active in the live database. **Not**
      independently forced live (same limitation prior issues hit — can't
      be scripted deterministically): a real 15-minute-inactive session
      actually getting swept, a real WebSocket drop mid-turn, denied mic
      permission's exact browser dialog — all three covered by
      unit/integration tests with the relevant boundary mocked instead.
    - Deployed to production (`ai-english-tutor-beta.vercel.app`).
      `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` added to Vercel
      (Production + Preview) and to Supabase Vault. Two new migrations
      applied to the live database (by the user, via
      `supabase db push --linked`): `20260709120000_error_handling_reliability`
      (sessions `active`/`finalizing` statuses, `last_activity_at`, index)
      and `20260709120500_schedule_session_maintenance` (`pg_cron`/`pg_net`
      extensions + the schedule itself).
    - **Known, not fixed**: `pg_net`'s extension registration landed in the
      `public` schema instead of Supabase's recommended `extensions` schema
      (a Supabase security-advisor WARN, cosmetic — `net.*` functions work
      fine either way). Low priority; `alter extension pg_net set schema
      extensions;` would fix it if ever revisited.

## Not started yet

Nothing — all 6 issues from the original design spec are closed. Future
work would come from a new spec/issue, not this list.

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
4. [#4 Post-session summarization + recap + progress updates](https://github.com/Guri10/ai-english-tutor/issues/4) — **closed**. Blocked by #3
5. [#5 Correction modes (inline vs. summary)](https://github.com/Guri10/ai-english-tutor/issues/5) — **closed**. Blocked by #4
6. [#6 Error handling & reliability](https://github.com/Guri10/ai-english-tutor/issues/6) — **closed**. Blocked by #5

Tests are not a separate trailing issue — each slice's acceptance criteria
includes tests for its own deterministic logic (TDD per slice), per spec §5.

All 6 issues from the original design spec are now closed and deployed to
production. Remaining known, deliberately-deferred items (not blocking,
noted for whoever picks up new work):
- The non-transactional `student_state` read-modify-write race flagged
  under issues #4/#5/#6 (concurrent session-ends for the same user can lose
  one session's worth of progress) — needs a DB-side atomic RPC to fix
  properly.
- `pg_net`'s extension schema placement (cosmetic Supabase advisor WARN,
  see issue #6 above).
- The `flag_correction` tool's structured mistake data (type/example/
  correction) is generated by the model but never read beyond its
  occurrence (issue #5) — could power a "what was corrected live" detail
  view.

No open issues remain in this repo as of this writing. Next work needs a
new spec or issue to define scope.
