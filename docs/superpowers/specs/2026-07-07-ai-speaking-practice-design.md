# AI English Speaking Practice — Design

Date: 2026-07-07

## Purpose

A web platform for friends and family (ages 10+) to practice spoken English with an AI tutor. The AI holds a level-appropriate conversation, corrects mistakes as it goes (in a style the student chooses), and tracks the student's progress across sessions so future conversations adapt to them.

This spec covers the **core speaking-practice loop only** — the smallest end-to-end slice of the product.

### Out of scope (future specs)

- Structured lessons/tasks (grammar drills, vocab exercises).
- Off-app content recommendations (YouTube clips, movies, shows).
- Admin/parental controls.

## 1. Architecture

**Stack:**
- **Frontend:** Next.js (App Router), mobile-first responsive UI, deployed on Vercel. Primary usage is expected to be iPhone Safari, not desktop.
- **Auth/DB:** Supabase — magic-link (passwordless) email auth, Postgres for all app data.
- **Conversation + voice:** OpenAI **Realtime API**. A single session handles speech-to-text, the tutor's conversation/correction logic, and text-to-speech output together — no separate STT/TTS calls, no second LLM vendor in this loop.
- **Voice UX:** push-to-talk. Server-side voice activity detection (VAD) is disabled; the client explicitly commits the input audio buffer and requests a response when the student releases the talk button. This keeps the interaction turn-based ("walkie-talkie") rather than a live/interruptible phone call, which is deliberately out of scope for v1 to keep the first build simple. (The Realtime API supports live mode; switching to it later is a mode change, not a re-architecture.)
- **Session orchestration:** a Next.js server route brokers each Realtime session — it fetches the student's profile, builds the system prompt, mints an ephemeral Realtime API token (so no API key reaches the browser), and persists results to Supabase once the session ends.

## 2. Data model

Supabase's `auth.users` owns the account. App-owned tables:

- **`profiles`** — `id` (FK → `auth.users`), `display_name`, `correction_mode` (`'inline' | 'summary'`, default preference), `created_at`.
- **`student_state`** — one row per user, the rolling structured profile: `level_score` (CEFR-ish A1–C2 scale), `streak_count`, `longest_streak`, `total_sessions`, `last_session_at`.
- **`level_history`** — append-only: `user_id`, `level_score`, `recorded_at`. One row per completed session; powers the "level over time" chart.
- **`recurring_mistakes`** — `user_id`, `mistake_type` (e.g. `"article_usage"`, `"past_tense"`), `occurrence_count`, `last_example`, `last_seen_at`. Upserted after each session; powers the "recurring mistake patterns" view.
- **`sessions`** — `id`, `user_id`, `scenario_topic`, `correction_mode_used`, `started_at`, `ended_at`, `level_before`, `level_after`, `status` (`'completed' | 'pending_summary'`).
- **`session_transcripts`** — `session_id`, `raw_transcript` (jsonb). Internal use only (source for post-session summarization) — **not surfaced in the UI**. The progress dashboard is level + mistakes + streaks only, not transcripts.

The student-facing dashboard is built entirely from `student_state`, `level_history`, and `recurring_mistakes` — never from raw transcripts.

## 3. Conversation & correction flow

**Session start:** student taps "Start practice." The server reads `student_state` + `recurring_mistakes`, builds a system prompt (tutor persona, a scenario chosen to match `level_score`, and the student's known weak spots to listen for), and mints an ephemeral Realtime API token. The client opens the Realtime session with this prompt; the AI opens with a scenario-appropriate spoken greeting. Topic/scenario selection is entirely AI-driven — no manual picker.

**Turn mechanics (push-to-talk):** student holds a mic button to speak, releases to send. On release, the client commits the input audio buffer and explicitly requests a response (server VAD off — no auto-interruption). The reply streams back as audio (played immediately) plus a text transcript captured via the Realtime API's event stream and buffered client-side for the session.

**Correction modes** (`profiles.correction_mode`, overridable at session start):
- **Inline** — the model is instructed to briefly flag a mistake right after it happens ("quick note — it's 'I went', not 'I goed'") in-voice, then continue the scenario naturally.
- **Summary** — the model is instructed never to correct mid-conversation; it converses naturally and mistakes surface only at session end.

**Session end:** student taps "End session" — no hard timer or turn cap in v1; the student controls length. The client closes the Realtime session, the buffered transcript is written to `session_transcripts`, and a single summarization call (structured-output prompt) reads it and produces an updated `level_score`, a list of mistakes (type + example + correction), and topics covered. This updates `sessions`, `level_history`, and `recurring_mistakes`. The student sees an end-of-session recap: for `summary` mode this is where corrections first appear; for `inline` mode it's mainly a level/streak recap, since corrections were already delivered live.

## 4. Error handling

- **Mic/connection failures** — if the Realtime WebSocket drops or mic permission is denied (common on iOS Safari), show an inline error with a reconnect option. Transcript captured so far is preserved client-side.
- **Abandoned sessions** (tab closed without ending the session) — a `beforeunload`/visibility handler attempts a best-effort close-and-save. As a backstop, a server-side sweep finalizes any session with no activity for 15 minutes using whatever transcript was captured, so a student's progress state never silently misses a session.
- **Summarization call failure** — retried with backoff; if it still fails, the session is marked `pending_summary` and the recap screen shows a "processing" state rather than blocking or losing the session. A background job retries later.
- **Auth failures** (expired/misused magic link) — standard Supabase-handled error states; student re-requests a link.
- **Cost guardrail** — Realtime API voice sessions cost money per minute. A simple per-user daily session cap (configurable; default 10 sessions/day) prevents runaway spend from a stuck client or accidental loop. No further rate limiting is needed at friends-and-family scale.

## 5. Testing

- Deterministic logic — data model updates, summary-JSON parsing into `level_history`/`recurring_mistakes`, abandoned-session finalization, auth flows — gets standard unit/integration tests with the Realtime API and summarization calls mocked. No real API spend in CI.
- The conversational/voice experience itself (correction tone, latency feel, scenario quality) can't be meaningfully asserted by automated tests — that's manual/exploratory testing once built. Before wiring up the full app, use a throwaway prototype to sanity-check the push-to-talk state machine and correction-mode prompts feel right.
