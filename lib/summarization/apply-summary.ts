import type { SessionSummary } from "./session-summary-schema";

export type StudentStateSnapshot = {
  levelScore: string;
  streakCount: number;
  longestStreak: number;
  totalSessions: number;
  lastSessionAt: string | null;
};

export type ApplySummaryInput = {
  summary: SessionSummary;
  studentState: StudentStateSnapshot;
  // Current occurrence_count per mistake_type already stored in
  // recurring_mistakes for this user — absent key means no row exists yet.
  existingMistakeCounts?: Record<string, number>;
  endedAt: string;
};

export type RecurringMistakeUpsert = {
  mistakeType: string;
  occurrenceCount: number;
  lastExample: string;
  lastSeenAt: string;
};

export type ApplySummaryResult = {
  sessionUpdate: {
    status: "completed";
    levelAfter: string;
    scenarioTopic: string | null;
  };
  levelHistoryInsert: {
    levelScore: string;
    recordedAt: string;
  };
  recurringMistakeUpserts: RecurringMistakeUpsert[];
  studentStateUpdate: {
    levelScore: string;
    streakCount: number;
    longestStreak: number;
    totalSessions: number;
    lastSessionAt: string;
  };
};

export function applySummary({
  summary,
  studentState,
  existingMistakeCounts = {},
  endedAt,
}: ApplySummaryInput): ApplySummaryResult {
  const streakCount = computeStreakCount(studentState, endedAt);
  const longestStreak = Math.max(studentState.longestStreak, streakCount);

  return {
    sessionUpdate: {
      status: "completed",
      levelAfter: summary.levelScore,
      scenarioTopic:
        summary.topicsCovered.length > 0
          ? summary.topicsCovered.join(", ")
          : null,
    },
    levelHistoryInsert: {
      levelScore: summary.levelScore,
      recordedAt: endedAt,
    },
    recurringMistakeUpserts: groupMistakesByType(
      summary.mistakes,
      existingMistakeCounts,
      endedAt
    ),
    studentStateUpdate: {
      levelScore: summary.levelScore,
      streakCount,
      longestStreak,
      totalSessions: studentState.totalSessions + 1,
      lastSessionAt: endedAt,
    },
  };
}

function groupMistakesByType(
  mistakes: SessionSummary["mistakes"],
  existingMistakeCounts: Record<string, number>,
  lastSeenAt: string
): RecurringMistakeUpsert[] {
  const byType = new Map<string, { count: number; lastExample: string }>();
  for (const mistake of mistakes) {
    const existing = byType.get(mistake.type);
    byType.set(mistake.type, {
      count: (existing?.count ?? 0) + 1,
      lastExample: mistake.example,
    });
  }
  return [...byType.entries()].map(([mistakeType, { count, lastExample }]) => ({
    mistakeType,
    occurrenceCount: (existingMistakeCounts[mistakeType] ?? 0) + count,
    lastExample,
    lastSeenAt,
  }));
}

// Daily streak, compared on UTC calendar day since no per-user timezone is
// stored: same day as the last session leaves it unchanged, exactly one day
// later extends it, anything else (first ever session, or a gap) resets it.
function computeStreakCount(
  studentState: StudentStateSnapshot,
  endedAt: string
): number {
  if (!studentState.lastSessionAt) return 1;

  const lastDay = utcDateString(studentState.lastSessionAt);
  const today = utcDateString(endedAt);
  if (lastDay === today) return studentState.streakCount;

  const gapDays = daysBetween(lastDay, today);
  if (gapDays === 1) return studentState.streakCount + 1;

  return 1;
}

function utcDateString(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(fromDate: string, toDate: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / msPerDay);
}
