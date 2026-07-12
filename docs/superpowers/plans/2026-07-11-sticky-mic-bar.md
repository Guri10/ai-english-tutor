# Sticky Mic/End-Session Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin "Hold to talk" and "End session" to a fixed bottom bar during a practice session, with the transcript auto-scrolling to the newest message, so the student never has to scroll to find the mic button as the conversation grows.

**Architecture:** Pure layout change inside `app/practice/practice-session.tsx`. The mic button and end-session button move from normal page flow into one `position: fixed` bar pinned to the bottom of the viewport, visible under the same condition `canEndSession` already uses today. A sentinel ref after the transcript list drives a `scrollIntoView` effect keyed on transcript length.

**Tech Stack:** Next.js App Router client component, Tailwind CSS, no new dependencies.

**Spec:** [docs/superpowers/specs/2026-07-11-sticky-mic-bar-design.md](../specs/2026-07-11-sticky-mic-bar-design.md)

## Global Constraints

- Node: use `export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"` before any `npm`/`npx` command in this shell (see `current_state.md` Environment quirks — plain `node`/`npm` on PATH resolve to a broken v10).
- No new pure logic is being introduced (no new function extracted, just JSX repositioning plus one `useEffect`), so there's no new unit test to write TDD-style — this matches the design spec's own Testing section. Verification is manual in the browser, consistent with how this repo verifies WebRTC/push-to-talk behavior elsewhere (see the google-oauth-auth plan's precedent).
- `canEndSession` (`state.phase !== "idle" && state.phase !== "ended"`) is already true during `connecting` and `error`, not just the mic-button phases (`ready`/`recording`/`committing`/`responding`) — the fixed bar's visibility must use `canEndSession` (not the narrower mic-phase list) so "End session" keeps appearing in exactly the phases it does today. The mic button itself keeps its own existing inner condition inside the bar.

---

## Task 1: Move Hold-to-talk and End session into a fixed bottom bar

**Files:**
- Modify: `app/practice/practice-session.tsx:397-503` (the component's returned JSX)

**Interfaces:**
- Consumes: existing `state.phase`, `canEndSession`, `micDown`, `micUp`, `endSession` — all already defined earlier in the component, unchanged.
- Produces: no new exports; purely restructures existing JSX.

- [ ] **Step 1: Read the current return block to confirm line numbers before editing**

```bash
grep -n "return (" app/practice/practice-session.tsx
```

Expected: matches the `return (` at line 397 (the JSX block starting `<div className="flex w-full max-w-md flex-col items-center gap-6">`). If the line number has drifted, use the printed number instead of 397 below.

- [ ] **Step 2: Replace the return block**

Replace the full `return (...)` block (the one starting `<div className="flex w-full max-w-md flex-col items-center gap-6">` and ending with the matching closing `</div>` before `function Recap`) with:

```tsx
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 pb-56">
      {state.phase === "idle" && (
        <div className="flex flex-col items-center gap-4">
          <div role="radiogroup" aria-label="Correction style" className="flex gap-2">
            {CORRECTION_MODE_OPTIONS.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={state.correctionMode === mode}
                onClick={() => dispatch({ type: "SET_CORRECTION_MODE", mode })}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                style={{
                  backgroundColor: state.correctionMode === mode ? "#2563eb" : undefined,
                  color: state.correctionMode === mode ? "white" : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={startSession}
            className="rounded-full border border-black/[.08] px-6 py-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Start practice
          </button>
        </div>
      )}

      {state.phase === "connecting" && <p>Connecting…</p>}

      {state.phase === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-red-600 dark:text-red-400">{state.lastError}</p>
          <button
            type="button"
            onClick={reconnect}
            className="rounded-full border border-black/[.08] px-6 py-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Reconnect
          </button>
        </div>
      )}

      {state.transcript.length > 0 && (
        <ul className="flex w-full flex-col gap-2">
          {state.transcript.map((entry, index) => (
            <li
              key={index}
              className="rounded-lg border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.145]"
            >
              <span className="font-medium">
                {entry.speaker === "student" ? "You" : "Tutor"}:
              </span>{" "}
              {entry.text}
            </li>
          ))}
        </ul>
      )}

      {state.phase === "ended" && (
        <div className="flex w-full flex-col items-center gap-4 text-center">
          {saveState.phase === "saving" && <p>Saving your session…</p>}
          {saveState.phase === "error" && (
            <p className="text-red-600 dark:text-red-400">
              Couldn&apos;t save your session — please try again later.
            </p>
          )}
          {saveState.phase === "saved" && <Recap result={saveState.result} />}
          <a href="/practice" className="underline">
            Start a new session
          </a>
        </div>
      )}

      {canEndSession && (
        <div className="fixed inset-x-0 bottom-0 flex flex-col items-center gap-3 border-t border-black/[.08] bg-background px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-white/[.145]">
          {["ready", "recording", "committing", "responding"].includes(state.phase) && (
            <button
              type="button"
              disabled={state.phase !== "ready" && state.phase !== "recording"}
              onPointerDown={micDown}
              onPointerUp={micUp}
              onPointerCancel={micUp}
              className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-black/[.15] text-sm font-medium transition-colors disabled:opacity-50 dark:border-white/[.2]"
              style={{
                backgroundColor: state.phase === "recording" ? "#ef4444" : undefined,
                color: state.phase === "recording" ? "white" : undefined,
              }}
            >
              {state.phase === "recording" ? "Recording…" : "Hold to talk"}
            </button>
          )}
          <button
            type="button"
            onClick={endSession}
            className="rounded-full border border-black/[.08] px-6 py-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            End session
          </button>
        </div>
      )}
    </div>
  );
```

Notes on what changed vs. the original:
- The mic button and "End session" button were removed from their old positions (between the error block and the transcript list, and between the transcript list and the ended block) and combined into one `fixed inset-x-0 bottom-0` bar at the very end, gated on `canEndSession` (same condition "End session" used before — this preserves it appearing during `connecting`/`error` too, not just the four mic-button phases).
- Added `pb-56` to the outer wrapper so the last transcript entry / ended-state content isn't hidden behind the fixed bar.
- `View your progress` / `Sign out` links are rendered by the parent page (`app/practice/page.tsx`), not this component — confirm in Step 3 that they're unaffected.
- The auto-scroll sentinel (`transcriptEndRef`) is added in Task 2, not here — this task is layout-only and must lint/build clean on its own.

- [ ] **Step 3: Confirm the sign-out/progress links live outside this component**

```bash
grep -n "View your progress\|Sign out" app/practice/*.tsx
```

Expected: matches in a file other than `practice-session.tsx` (e.g. `app/practice/page.tsx`), confirming Task 1 didn't need to touch them — they stay in normal page flow as decided in the design.

- [ ] **Step 4: Lint**

```bash
export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
npm run lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/practice/practice-session.tsx
git commit -m "$(cat <<'EOF'
Pin Hold-to-talk/End session to a fixed bottom bar

The mic button used to scroll out of view as the transcript grew,
forcing the student to scroll back up to talk again. Moving it (and
End session) into a fixed bottom bar keeps both reachable at all
times, matching the standard chat-app footer pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Auto-scroll to the newest transcript entry

**Files:**
- Modify: `app/practice/practice-session.tsx` (add one ref + one effect near the other refs/effects, and one sentinel `<div>` in the returned JSX)

**Interfaces:**
- Consumes: `state.transcript` (existing `TranscriptEntry[]` from `session-machine.ts`, unchanged).
- Produces: `transcriptEndRef: RefObject<HTMLDivElement | null>` — used only within this component.

- [ ] **Step 1: Add the ref next to the component's other refs**

In `app/practice/practice-session.tsx`, find:

```tsx
  const audioElRef = useRef<HTMLAudioElement | null>(null);
```

Add immediately after it:

```tsx
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
```

- [ ] **Step 2: Add the auto-scroll effect**

Find the mount/unmount effect:

```tsx
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupConnection();
    };
  }, [cleanupConnection]);
```

Add immediately after it:

```tsx
  useEffect(() => {
    if (state.transcript.length === 0) return;
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.transcript.length]);
```

- [ ] **Step 3: Add the sentinel div after the transcript list**

In the JSX returned by the component (added in Task 1), find:

```tsx
        </ul>
      )}

      {state.phase === "ended" && (
```

Replace with:

```tsx
        </ul>
      )}
      <div ref={transcriptEndRef} />

      {state.phase === "ended" && (
```

- [ ] **Step 4: Lint and build**

```bash
export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
npm run lint
npm run build
```

Expected: both clean.

- [ ] **Step 5: Run the existing test suite (regression check)**

```bash
export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
npm test
```

Expected: all existing tests pass unchanged — nothing in `session-machine.ts`, `map-server-event.ts`, or any tested module was touched by this or Task 1.

- [ ] **Step 6: Commit**

```bash
git add app/practice/practice-session.tsx
git commit -m "$(cat <<'EOF'
Auto-scroll transcript to newest message

Combined with the fixed bottom bar (previous commit), the student
never has to scroll manually during a session — each new message
scrolls into view just above the bar as soon as it arrives.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Manually verify live in the browser**

```bash
export PATH="$HOME/.nvm/versions/node/v23.7.0/bin:$PATH"
npm run dev
```

In a browser at `http://localhost:3000/practice`:
1. Start a session, confirm the "Hold to talk" bar is pinned to the bottom of the viewport and doesn't move on scroll.
2. Have several back-and-forth exchanges (enough that the transcript overflows one screen) and confirm each new message auto-scrolls into view just above the fixed bar, without the fixed bar ever covering the newest line.
3. Confirm "End session" is in the same bar and works.
4. Trigger the `error` phase (e.g. deny mic permission) and confirm the fixed bar still shows "End session" (no mic button) — matches today's behavior where `canEndSession` is already true in that phase.
5. Confirm the idle (correction-mode picker) screen and the `ended` (recap) screen render with no fixed bar and no leftover bottom gap that looks broken.
6. Test on an iOS Safari viewport (or Chrome DevTools device emulation with a safe-area-inset simulation) to confirm the bar isn't obscured by the home-indicator gesture area.
7. Check the browser console for errors on all of the above.

- [ ] **Step 8: Record the result in `current_state.md`**

Per this repo's progress-log convention (`AGENTS.md`), add a short note under `current_state.md`'s "Done so far" / progress log noting the sticky bottom bar + auto-scroll UI change and that it was manually verified, referencing this plan's path.
