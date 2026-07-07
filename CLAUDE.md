See `AGENTS.md` for the full workflow (issue tracker conventions, the
implement → review → close cycle, domain docs, environment quirks) — it's
written to make sense for any coding agent, not just Claude Code. The
sections below add Claude-Code-specific skill invocations on top of that.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (repo: Guri10/ai-english-tutor) via the `gh` CLI. External PRs are not treated as a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily as decisions crystallize). See `docs/agents/domain.md`.
