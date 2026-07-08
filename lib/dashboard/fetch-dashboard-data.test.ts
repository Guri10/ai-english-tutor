import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDashboardData } from "./fetch-dashboard-data";

type QueryResult = { data: unknown; error: unknown };

function mockSupabase(
  options: {
    studentState?: QueryResult;
    recurringMistakes?: QueryResult;
    levelHistory?: QueryResult;
    eqSpy?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const studentState = options.studentState ?? { data: null, error: null };
  const recurringMistakes = options.recurringMistakes ?? { data: [], error: null };
  const levelHistory = options.levelHistory ?? { data: [], error: null };
  const eqSpy = options.eqSpy ?? vi.fn();

  const from = vi.fn((table: string) => {
    if (table === "student_state") {
      return {
        select: () => ({
          eq: (...args: unknown[]) => {
            eqSpy(table, ...args);
            return { maybeSingle: () => Promise.resolve(studentState) };
          },
        }),
      };
    }
    if (table === "recurring_mistakes") {
      return {
        select: () => ({
          eq: (...args: unknown[]) => {
            eqSpy(table, ...args);
            return { order: () => Promise.resolve(recurringMistakes) };
          },
        }),
      };
    }
    if (table === "level_history") {
      return {
        select: () => ({
          eq: (...args: unknown[]) => {
            eqSpy(table, ...args);
            return {
              order: () => ({
                limit: () => Promise.resolve(levelHistory),
              }),
            };
          },
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from } as unknown as SupabaseClient;
}

describe("fetchDashboardData", () => {
  test("delegates fetched rows from all three tables to shapeDashboardData", async () => {
    // Only checks that wiring/delegation happened - the value-mapping
    // behavior itself is covered by shape-dashboard-data.test.ts.
    const supabase = mockSupabase({
      studentState: {
        data: {
          level_score: "B1",
          streak_count: 4,
          longest_streak: 9,
          total_sessions: 12,
        },
        error: null,
      },
      recurringMistakes: {
        data: [
          {
            mistake_type: "article_usage",
            occurrence_count: 5,
            last_example: "I saw a elephant.",
          },
        ],
        error: null,
      },
      levelHistory: {
        data: [{ level_score: "B1", recorded_at: "2026-07-05T00:00:00Z" }],
        error: null,
      },
    });

    const result = await fetchDashboardData(supabase, "user-123");

    expect(result.levelScore).toBe("B1");
    expect(result.recurringMistakes).toHaveLength(1);
    expect(result.recentLevelHistory).toHaveLength(1);
  });

  test("returns a zero/empty state when no rows exist for a brand-new user", async () => {
    const supabase = mockSupabase();

    const result = await fetchDashboardData(supabase, "user-456");

    expect(result).toEqual({
      levelScore: "A1",
      streakCount: 0,
      longestStreak: 0,
      totalSessions: 0,
      recurringMistakes: [],
      recentLevelHistory: [],
    });
  });

  test("queries all three tables scoped to the given user id", async () => {
    const eqSpy = vi.fn();
    const supabase = mockSupabase({ eqSpy });

    await fetchDashboardData(supabase, "user-789");

    expect(eqSpy).toHaveBeenCalledWith("student_state", "user_id", "user-789");
    expect(eqSpy).toHaveBeenCalledWith(
      "recurring_mistakes",
      "user_id",
      "user-789"
    );
    expect(eqSpy).toHaveBeenCalledWith("level_history", "user_id", "user-789");
  });

  test("logs an error and still returns a usable result when a query fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = mockSupabase({
      studentState: { data: null, error: new Error("connection reset") },
    });

    const result = await fetchDashboardData(supabase, "user-999");

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(result.levelScore).toBe("A1");

    consoleErrorSpy.mockRestore();
  });
});
