import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSessionContext } from "./fetch-session-context";

type QueryResult = { data: unknown; error: unknown };

function mockSupabase(
  options: {
    studentState?: QueryResult;
    recurringMistakes?: QueryResult;
    profile?: QueryResult;
    eqSpy?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const studentState = options.studentState ?? { data: null, error: null };
  const recurringMistakes = options.recurringMistakes ?? { data: [], error: null };
  const profile = options.profile ?? { data: null, error: null };
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
            return {
              order: () => ({ limit: () => Promise.resolve(recurringMistakes) }),
            };
          },
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: (...args: unknown[]) => {
            eqSpy(table, ...args);
            return { maybeSingle: () => Promise.resolve(profile) };
          },
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from } as unknown as SupabaseClient;
}

describe("fetchSessionContext", () => {
  test("shapes rows from all three tables", async () => {
    const supabase = mockSupabase({
      studentState: { data: { level_score: "B1" }, error: null },
      recurringMistakes: {
        data: [{ mistake_type: "article_usage", last_example: "I saw a elephant" }],
        error: null,
      },
      profile: { data: { correction_mode: "summary" }, error: null },
    });

    const result = await fetchSessionContext(supabase, "user-123");

    expect(result).toEqual({
      levelScore: "B1",
      recurringMistakes: [
        { mistakeType: "article_usage", lastExample: "I saw a elephant" },
      ],
      correctionMode: "summary",
    });
  });

  test("returns defaults for a brand-new user with no rows yet", async () => {
    const supabase = mockSupabase();

    const result = await fetchSessionContext(supabase, "user-456");

    expect(result).toEqual({
      levelScore: "A1",
      recurringMistakes: [],
      correctionMode: "inline",
    });
  });

  test("queries all three tables scoped to the given user id", async () => {
    const eqSpy = vi.fn();
    const supabase = mockSupabase({ eqSpy });

    await fetchSessionContext(supabase, "user-789");

    expect(eqSpy).toHaveBeenCalledWith("student_state", "user_id", "user-789");
    expect(eqSpy).toHaveBeenCalledWith(
      "recurring_mistakes",
      "user_id",
      "user-789"
    );
    expect(eqSpy).toHaveBeenCalledWith("profiles", "id", "user-789");
  });

  test("logs an error and still returns a usable result when a query fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = mockSupabase({
      studentState: { data: null, error: new Error("connection reset") },
    });

    const result = await fetchSessionContext(supabase, "user-999");

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(result.levelScore).toBe("A1");

    consoleErrorSpy.mockRestore();
  });
});
