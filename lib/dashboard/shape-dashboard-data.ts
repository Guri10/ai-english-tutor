export type DashboardData = {
  levelScore: string;
  streakCount: number;
  longestStreak: number;
  totalSessions: number;
  recurringMistakes: RecurringMistake[];
};

export type RecurringMistake = {
  mistakeType: string;
  occurrenceCount: number;
  lastExample: string | null;
};

export type StudentStateRow = {
  level_score: string;
  streak_count: number;
  longest_streak: number;
  total_sessions: number;
} | null;

export type RecurringMistakeRow = {
  mistake_type: string;
  occurrence_count: number;
  last_example: string | null;
};

const DEFAULT_LEVEL_SCORE = "A1";

export function shapeDashboardData(
  studentState: StudentStateRow,
  recurringMistakes: RecurringMistakeRow[]
): DashboardData {
  return {
    levelScore: studentState?.level_score ?? DEFAULT_LEVEL_SCORE,
    streakCount: studentState?.streak_count ?? 0,
    longestStreak: studentState?.longest_streak ?? 0,
    totalSessions: studentState?.total_sessions ?? 0,
    recurringMistakes: recurringMistakes.map((row) => ({
      mistakeType: row.mistake_type,
      occurrenceCount: row.occurrence_count,
      lastExample: row.last_example,
    })),
  };
}
