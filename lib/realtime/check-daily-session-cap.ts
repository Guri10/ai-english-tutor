// Spec §4 cost guardrail: a simple per-user daily session cap. Counts
// session-start *attempts* (any status), not just completed sessions —
// the point is bounding spend from a stuck client or accidental loop, which
// happens at connect time regardless of how the session ends.
export const DEFAULT_DAILY_SESSION_CAP = 10;

export function isDailySessionCapExceeded(
  sessionsStartedToday: number,
  cap: number = DEFAULT_DAILY_SESSION_CAP
): boolean {
  return sessionsStartedToday >= cap;
}

export function getDailySessionCap(): number {
  const raw = process.env.DAILY_SESSION_CAP;
  if (!raw) return DEFAULT_DAILY_SESSION_CAP;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_SESSION_CAP;
}

// UTC calendar day start, matching applySummary's existing UTC-day streak
// convention (lib/summarization/apply-summary.ts) rather than introducing a
// second per-user-timezone concept.
export function utcDayStartIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}
