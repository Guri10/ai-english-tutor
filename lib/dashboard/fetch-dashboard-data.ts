import type { SupabaseClient } from "@supabase/supabase-js";
import { shapeDashboardData, type DashboardData } from "./shape-dashboard-data";

const RECENT_LEVEL_HISTORY_LIMIT = 5;

export async function fetchDashboardData(
  supabase: SupabaseClient,
  userId: string
): Promise<DashboardData> {
  const [studentStateResult, recurringMistakesResult, levelHistoryResult] =
    await Promise.all([
      supabase
        .from("student_state")
        .select("level_score, streak_count, longest_streak, total_sessions")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("recurring_mistakes")
        .select("mistake_type, occurrence_count, last_example")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("level_history")
        .select("level_score, recorded_at")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(RECENT_LEVEL_HISTORY_LIMIT),
    ]);

  for (const result of [
    studentStateResult,
    recurringMistakesResult,
    levelHistoryResult,
  ]) {
    if (result.error) {
      console.error("fetchDashboardData: query failed", result.error);
    }
  }

  return shapeDashboardData(
    studentStateResult.data,
    recurringMistakesResult.data ?? [],
    levelHistoryResult.data ?? []
  );
}
