import { DEFAULT_LEVEL_SCORE } from "@/lib/level";

export type DashboardData = {
  levelScore: string;
  streakCount: number;
  longestStreak: number;
  totalSessions: number;
  recurringMistakes: RecurringMistake[];
  recentLevelHistory: LevelHistoryEntry[];
};

export type RecurringMistake = {
  mistakeType: string;
  occurrenceCount: number;
  lastExample: string | null;
};

export type LevelHistoryEntry = {
  levelScore: string;
  recordedAt: string;
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

export type LevelHistoryRow = {
  level_score: string;
  recorded_at: string;
};

export function shapeDashboardData(
  studentState: StudentStateRow,
  recurringMistakes: RecurringMistakeRow[],
  levelHistory: LevelHistoryRow[]
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
    recentLevelHistory: levelHistory.map((row) => ({
      levelScore: row.level_score,
      recordedAt: row.recorded_at,
    })),
  };
}
