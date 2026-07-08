import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionMode } from "./session-machine";
import type { RecurringMistakeForPrompt } from "./build-system-prompt";
import { logQueryErrors } from "@/lib/supabase/log-query-errors";
import { DEFAULT_LEVEL_SCORE } from "@/lib/level";

const RECURRING_MISTAKES_LIMIT = 10;
const DEFAULT_CORRECTION_MODE: CorrectionMode = "inline";

export type SessionContext = {
  levelScore: string;
  recurringMistakes: RecurringMistakeForPrompt[];
  correctionMode: CorrectionMode;
};

export async function fetchSessionContext(
  supabase: SupabaseClient,
  userId: string
): Promise<SessionContext> {
  const [studentStateResult, recurringMistakesResult, profileResult] =
    await Promise.all([
      supabase
        .from("student_state")
        .select("level_score")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("recurring_mistakes")
        .select("mistake_type, last_example")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false })
        .limit(RECURRING_MISTAKES_LIMIT),
      supabase
        .from("profiles")
        .select("correction_mode")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  logQueryErrors("fetchSessionContext", [
    studentStateResult,
    recurringMistakesResult,
    profileResult,
  ]);

  const studentState = studentStateResult.data as { level_score: string } | null;
  const recurringMistakes =
    (recurringMistakesResult.data as
      | { mistake_type: string; last_example: string | null }[]
      | null) ?? [];
  const profile = profileResult.data as { correction_mode: CorrectionMode } | null;

  return {
    levelScore: studentState?.level_score ?? DEFAULT_LEVEL_SCORE,
    recurringMistakes: recurringMistakes.map((row) => ({
      mistakeType: row.mistake_type,
      lastExample: row.last_example,
    })),
    correctionMode: profile?.correction_mode ?? DEFAULT_CORRECTION_MODE,
  };
}
