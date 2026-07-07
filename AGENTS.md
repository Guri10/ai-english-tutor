# Agent instructions

This file is for any coding agent working in this repo — Claude Code,
Codex, Cursor, or otherwise. `CLAUDE.md` adds Claude-Code-specific skill
pointers on top of this; everything here should make sense without them.

## Start here

Read `current_state.md` first. It's the running log of what's done, what's
in progress, and what's next — don't re-derive project state from `git log`
or by re-reading every file. Update it whenever you finish a meaningful
step; don't rewrite its history, append to it.

The design spec (`docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md`)
is the source of truth for architecture, data model, and error handling.
`current_state.md` tracks progress and setup quirks, not design decisions —
don't duplicate the spec into it.

## Issue tracker

Work is tracked as GitHub Issues on `Guri10/ai-english-tutor`, via the `gh`
CLI. External PRs are not a triage surface. Conventions and exact `gh`
commands: `docs/agents/issue-tracker.md`.

Label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

Each issue is a **vertical slice** (a thin end-to-end path through every
layer — schema, API, UI, tests — not a horizontal layer), chained to the
others via native GitHub blocking dependencies. Check an issue's
`issue_dependencies_summary.blocked_by` (or a `Blocked by:` line in the
body as a fallback) before starting it.

An issue that's `ready-for-agent` carries an **Agent Brief** comment: a
durable, behavioral spec (what the system should do, not how — see that
comment's own structure for the exact template) plus concrete acceptance
criteria. Treat the brief as the contract; the original issue body and
discussion are context.

## Implementation workflow, per issue

1. Confirm the issue is `ready-for-agent` and read its Agent Brief.
2. Implement with TDD (red — write a failing test first and watch it fail
   for the right reason; green — minimal code to pass; refactor — clean up
   with tests staying green). See `lib/auth/route-guard.test.ts` for the
   established style: small pure functions, one behavior per test, real
   inputs over mocks where practical.
3. Verify locally before considering the work done: `npm test`,
   `npm run lint`, `npm run build`. All three must be clean.
4. Get a **fresh-context code review of the diff** before closing the
   issue — a second pass with no memory of *why* the code was written
   catches things the implementer is blind to. Apply the findings (or
   explicitly note why a finding doesn't apply), re-verify, and push.
5. Close the issue with a comment summarizing what shipped and what the
   review found/fixed, checking off the acceptance criteria.
6. Update `current_state.md`'s "Done so far" / "Not started yet" / "Next
   steps" sections to reflect the new state.

Tests are not a separate trailing issue at the end of the chain — each
slice's acceptance criteria includes tests for its own deterministic
logic, per the design spec's §5 Testing section.

## Domain docs

Single-context repo: one `CONTEXT.md` + `docs/adr/` at the repo root,
created lazily as decisions crystallize (neither exists yet — that's
expected at this stage, not a gap to fix proactively). See
`docs/agents/domain.md` for how these should be consulted and grown.

## Environment quirks

`current_state.md`'s "Environment quirks" section is kept current with
real gotchas hit while working in this repo — the Node version on `PATH`,
Next.js 16's `middleware.ts` → `proxy.ts` rename, Supabase's Redirect URL
wildcard requirement, etc. Read it before assuming something is broken;
it's probably already diagnosed there.

## Secrets

`.env.local` is gitignored and never committed — get real values from
whoever's driving the session. `.env.example` documents what's needed.
