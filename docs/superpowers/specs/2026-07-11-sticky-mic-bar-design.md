# Sticky Mic/End-Session Bar — Design

Date: 2026-07-11

## Purpose

During an active practice session, "Hold to talk" (and "End session") currently sit in normal page flow, above the growing transcript list. As the transcript grows, the mic button scrolls out of view, forcing the user to scroll back up to talk again.

**Motivation:** the student should never have to hunt for the mic button mid-conversation. Pinning it in place, with the transcript auto-scrolling to reveal new lines, keeps the primary controls reachable at all times — the standard pattern for chat-style UIs.

## Decision

- **Fixed bottom bar, full viewport width.** "Hold to talk" and "End session" move out of normal page flow into a `position: fixed` bar pinned to `bottom: 0` and spanning the full browser width, buttons centered inside it. This reads clearly as an app-level control on both mobile and desktop, consistent with typical chat-app footers.
- **Bar only appears while the mic button would appear today** — i.e. during `ready`, `recording`, `committing`, `responding` phases. It is absent on the idle/correction-mode screen, the `connecting`/`error` screens, and the `ended` recap screen. This is a straight relocation of existing conditional render logic, not a new visibility rule.
- **End session moves into the bar too**, since it's the other action used mid-conversation. It renders in the bar under the same `canEndSession` condition as today. "View your progress" and "Sign out" stay in normal, scrollable page flow (only relevant before/after a session, not pinned).
- **Auto-scroll to the newest transcript entry.** Whenever `state.transcript` grows, the page scrolls so the latest entry is visible just above the fixed bar, via `scrollIntoView({ behavior: "smooth", block: "end" })` on a sentinel ref. Combined with the fixed bar, the user never has to scroll manually during a session.
- **No auto-scroll trigger on mount/idle** — only fires when transcript length increases, so it doesn't fight the user's scroll position before any messages exist or after the session ends.

## Architecture / components

All changes are contained to `app/practice/practice-session.tsx`:

- **Fixed bar markup:** the existing mic-button block (`["ready", "recording", "committing", "responding"].includes(state.phase)`) and the existing `canEndSession` block are pulled out of the current linear JSX flow and rendered together inside one `<div>` styled `fixed inset-x-0 bottom-0` with the two buttons centered in a row/stack. Conditions controlling *when* each button appears/is disabled are unchanged — only their container and position move.
- **Bottom padding:** the scrollable content wrapper gets `padding-bottom` (or an empty spacer `div`) sized to the fixed bar's height, so the last transcript entry isn't hidden behind the bar. Height can be a fixed Tailwind value (e.g. matching the bar's actual rendered height) since the bar's contents don't vary in height across states where it's shown.
- **Sentinel ref + effect:** a `useRef<HTMLDivElement>(null)` placed after the transcript `<ul>`; a `useEffect` keyed on `state.transcript.length` calls `sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })`.
- **No changes** to `session-machine.ts`, `map-server-event.ts`, connection/WebRTC logic, or the save/recap flow (`actions.ts`, `Recap`). This is layout + one scroll effect only.

## Error handling

No new error paths — this is a presentational change. Existing error/disabled states for the mic button (`disabled={state.phase !== "ready" && state.phase !== "recording"}`) and end-session button carry over unchanged into the fixed bar.

## Testing

- No existing automated tests cover this component's rendering (push-to-talk and WebRTC aren't unit-testable per the existing codebase pattern — see `2026-07-08-google-oauth-auth-design.md`'s Testing section for precedent). Verification is manual in the browser: confirm the bar stays pinned as the transcript grows, confirm auto-scroll reveals each new message, confirm the bar disappears correctly on idle/error/ended screens, and confirm mobile viewport (iOS Safari, this app's primary target) doesn't get bar overlap issues from the on-screen keyboard or safe-area insets.
- Should account for `env(safe-area-inset-bottom)` in the fixed bar's padding so it isn't obscured by iOS home-indicator gesture areas.

## Non-goals

- No change to push-to-talk mechanics, session state machine, or save/recap flow.
- No swipe/drag gestures or resizable bar — a static-height fixed bar is sufficient.
- No virtualization of the transcript list — out of scope, existing list rendering is untouched.
