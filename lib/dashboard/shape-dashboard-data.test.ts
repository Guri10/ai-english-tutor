import { describe, expect, test } from "vitest";
import { shapeDashboardData } from "./shape-dashboard-data";

describe("shapeDashboardData", () => {
  test("shapes a populated student_state row and recurring mistakes", () => {
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
    });
  });

  test("falls back to a zero/empty state when no student_state row exists yet", () => {
    const result = shapeDashboardData(null, []);

    expect(result).toEqual({
      levelScore: "A1",
      streakCount: 0,
      longestStreak: 0,
      totalSessions: 0,
      recurringMistakes: [],
    });
  });

  test("falls back to zero counts even when a student_state row exists with no mistakes yet", () => {
    const result = shapeDashboardData(
      {
        level_score: "A2",
        streak_count: 1,
        longest_streak: 1,
        total_sessions: 1,
      },
      []
    );

    expect(result.recurringMistakes).toEqual([]);
    expect(result.levelScore).toBe("A2");
  });
});
