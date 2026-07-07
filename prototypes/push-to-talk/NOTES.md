# Prototype: push-to-talk session state machine

## Question

Does the turn-based (walkie-talkie) session state machine described in
[the design spec](../../docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md)
(§3 turn mechanics, §4 error handling) hold up under the edge cases that are
hard to reason about on paper:

- Illegal button presses (mic down while already recording or while the tutor
  is responding; mic up while not recording).
- Connection drops mid-turn (while recording / committing / responding) —
  does the transcript captured so far survive, per the "preserved
  client-side" guarantee in §4?
- Ending the session mid-turn (not just from the idle "ready" state) — does
  it still finalize cleanly, matching the best-effort-save / 15-minute-sweep
  backstop in §4?
- Correction-mode-tagged transcript segments: inline mode delivers a
  correction live and tags that transcript entry; summary mode accumulates
  mistakes silently and only the recap should show them (§3 correction
  modes). Does the state shape make it easy to tell "was this already told to
  the student live, or does it still need to show up in the recap"?
- Locking `correctionMode` once a turn has happened (spec says "overridable
  at session start" — implying it's fixed after that).

## Run it

```
npm run prototype:push-to-talk
```

## Answer

_(fill in after driving the TUI)_
