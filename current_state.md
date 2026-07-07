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
2. **Push-to-talk state machine prototype** (throwaway, per the design spec's
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

## Not started yet

- Next.js app scaffold (no `app/` directory exists yet).
- Supabase project/schema (the 6 tables in spec §2 don't exist anywhere yet —
  no live Supabase project is set up).
- Realtime API session-orchestration route (spec §1, §3).
- Core UI (start practice / push-to-talk mic / end session / recap).
- Error handling wiring (reconnect UX, beforeunload sweep, pending_summary
  retry, daily session cap) — spec §4.
- Any tests beyond the ad hoc prototype smoke test — spec §5.

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
- `package.json`/`tsconfig.json` at repo root currently exist *only* to run
  the prototype (`tsx`, `typescript` devDeps). They'll need to be
  replaced/merged when the real Next.js app is scaffolded (step: "Scaffold
  the app" below).

## Next steps (in order, per the design spec)

1. Drive `prototypes/push-to-talk/` interactively, fill in
   `prototypes/push-to-talk/NOTES.md`'s Answer section, then either fold
   `machine.ts` into the real app or delete the prototype dir once its
   question is answered.
2. Scaffold the Next.js app + Supabase project, wire up magic-link auth.
3. Create the schema: `profiles`, `student_state`, `level_history`,
   `recurring_mistakes`, `sessions`, `session_transcripts` (spec §2).
4. Build the session-orchestration route (system prompt builder + ephemeral
   Realtime token minting) — spec §1, §3.
5. Build the core loop UI (start → push-to-talk → end → recap).
6. Wire error handling per spec §4.
7. Add unit/integration tests for the deterministic logic per spec §5.
