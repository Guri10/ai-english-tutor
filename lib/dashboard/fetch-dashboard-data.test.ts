import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDashboardData } from "./fetch-dashboard-data";

function mockSupabase(options: {
  studentState: unknown;
  recurringMistakes: unknown[];
}) {
  const from = vi.fn((table: string) => {
    if (table === "student_state") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: options.studentState, error: null }),
          }),
        }),
      };
    }
    if (table === "recurring_mistakes") {
      return {
        select: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({ data: options.recurringMistakes, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from } as unknown as SupabaseClient;
}

describe("fetchDashboardData", () => {
  test("shapes rows fetched for the given user", async () => {
    const supabase = mockSupabase({
      studentState: {
        level_score: "B1",
        streak_count: 4,
        longest_streak: 9,
        total_sessions: 12,
      },
      recurringMistakes: [
        {
          mistake_type: "article_usage",
          occurrence_count: 5,
          last_example: "I saw a elephant.",
        },
      ],
    });

    const result = await fetchDashboardData(supabase, "user-123");

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
      ],
    });
  });

  test("returns a zero/empty state when no rows exist for a brand-new user", async () => {
    const supabase = mockSupabase({ studentState: null, recurringMistakes: [] });

    const result = await fetchDashboardData(supabase, "user-456");

    expect(result).toEqual({
      levelScore: "A1",
      streakCount: 0,
      longestStreak: 0,
      totalSessions: 0,
      recurringMistakes: [],
    });
  });

  test("queries both tables scoped to the given user id", async () => {
    const eqStudentState = vi.fn(() => ({
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }));
    const eqMistakes = vi.fn(() => ({
      order: () => Promise.resolve({ data: [], error: null }),
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "student_state") {
          return { select: () => ({ eq: eqStudentState }) };
        }
        return { select: () => ({ eq: eqMistakes }) };
      }),
    } as unknown as SupabaseClient;

    await fetchDashboardData(supabase, "user-789");

    expect(eqStudentState).toHaveBeenCalledWith("user_id", "user-789");
    expect(eqMistakes).toHaveBeenCalledWith("user_id", "user-789");
  });
});
