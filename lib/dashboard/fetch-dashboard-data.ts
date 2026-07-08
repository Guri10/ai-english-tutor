import type { SupabaseClient } from "@supabase/supabase-js";
import { shapeDashboardData, type DashboardData } from "./shape-dashboard-data";

export async function fetchDashboardData(
  supabase: SupabaseClient,
  userId: string
): Promise<DashboardData> {
  const [studentStateResult, recurringMistakesResult] = await Promise.all([
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
  ]);

  return shapeDashboardData(
    studentStateResult.data,
    recurringMistakesResult.data ?? []
  );
}
