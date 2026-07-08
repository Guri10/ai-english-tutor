import { describe, expect, test } from "vitest";
import { shapeDashboardData } from "./shape-dashboard-data";

describe("shapeDashboardData", () => {
  test("shapes a populated student_state row, recurring mistakes, and level history", () => {
    const result = shapeDashboardData(
      {
        level_score: "B1",
        streak_count: 4,
        longest_streak: 9,
        total_sessions: 12,
      },
      [
        {
          mistake_type: "article_usage",
          occurrence_count: 5,
          last_example: "I saw a elephant.",
        },
        { mistake_type: "past_tense", occurrence_count: 2, last_example: null },
      ],
      [
        { level_score: "B1", recorded_at: "2026-07-05T00:00:00Z" },
        { level_score: "A2", recorded_at: "2026-06-20T00:00:00Z" },
      ]
    );

    expect(result).toEqual({
      levelScore: "B1",
      streakCount: 4,
      longestStreak: 9,
      totalSessions: 12,
      recurringMistakes: [
        {
          mistakeType: "article_usage",
          occurrenceCount: 5,
          lastExample: "I saw a elephant.",
        },
        { mistakeType: "past_tense", occurrenceCount: 2, lastExample: null },
      ],
      recentLevelHistory: [
        { levelScore: "B1", recordedAt: "2026-07-05T00:00:00Z" },
        { levelScore: "A2", recordedAt: "2026-06-20T00:00:00Z" },
      ],
    });
  });

  test("falls back to a zero/empty state when no rows exist yet", () => {
    const result = shapeDashboardData(null, [], []);

    expect(result).toEqual({
      levelScore: "A1",
      streakCount: 0,
      longestStreak: 0,
      totalSessions: 0,
      recurringMistakes: [],
      recentLevelHistory: [],
    });
  });

  test("falls back to zero counts even when a student_state row exists with no mistakes or history yet", () => {
    const result = shapeDashboardData(
      {
        level_score: "A2",
        streak_count: 1,
        longest_streak: 1,
        total_sessions: 1,
      },
      [],
      []
    );

    expect(result.recurringMistakes).toEqual([]);
    expect(result.recentLevelHistory).toEqual([]);
    expect(result.levelScore).toBe("A2");
  });
});
