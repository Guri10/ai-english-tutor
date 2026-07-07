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

Driven via a scripted key-sequence runner against the real `tui.ts`/`machine.ts`
(not just asserted programmatically — each scenario's rendered frames were
read and checked against the spec). All hold up; no bugs found.

- **Illegal button presses** — mic-down before connect, double mic-down
  (already recording), mic-down while responding, and mic-up while not
  recording are all rejected with a clear `lastError` message and no state
  corruption (phase/turn/transcript untouched).
- **Connection drops mid-turn** — dropping during `recording`, `committing`,
  or `responding` all correctly move to `phase: "error"`, set
  `connectionDroppedDuring` to the phase it happened in, and preserve the
  transcript captured so far verbatim. `RECONNECT` → `CONNECTED` clears the
  error and returns to `ready`. Matches the §4 "preserved client-side"
  guarantee.
- **Ending mid-turn** — `END_SESSION` finalizes cleanly from `recording` and
  `responding` (not just idle `ready`), using whatever transcript exists at
  that point. Correctly illegal from `idle`.
- **Correction-mode tagging** — inline mode tags the transcript entry live
  (`isCorrection: true`) and `recap()` returns `showsCorrections: false`, so
  it isn't repeated at session end. Summary mode tags the entry the same way
  but `recap()` returns `showsCorrections: true` with the mistake included.
  Matches §3 exactly.
- **Mode lock** — toggling `correctionMode` after turn 1 is rejected with
  `"correction mode is locked after the first turn"`; mode stays unchanged.

**Open product question (not a bug, doesn't block trusting the reducer):**
after a mid-turn drop + reconnect, the interrupted turn's transcript entry
(e.g. a `"(recording audio…)"` placeholder, or a half-written tutor reply) is
left frozen/dangling — the machine doesn't retry or discard it, a fresh turn
just starts on top. Spec §4 only promises the transcript is *preserved*, not
that the interrupted turn is resumed, so this is compliant. Worth deciding
during issue #3 (real orchestration route + UI) whether the recap/live UI
should visually mark that entry as "interrupted."

**Verdict:** `machine.ts` is trusted. Safe to fold into the real app in
issue #3 (github.com/Guri10/ai-english-tutor#3).
