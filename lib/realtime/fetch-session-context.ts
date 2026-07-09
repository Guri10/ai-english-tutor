import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionMode } from "./session-machine";
import type { RecurringMistakeForPrompt } from "./build-system-prompt";
import { fetchDefaultCorrectionMode } from "./fetch-default-correction-mode";
import { logQueryErrors } from "@/lib/supabase/log-query-errors";
import { DEFAULT_LEVEL_SCORE } from "@/lib/level";

const RECURRING_MISTAKES_LIMIT = 10;

export type SessionContext = {
  levelScore: string;
  recurringMistakes: RecurringMistakeForPrompt[];
  correctionMode: CorrectionMode;
};

export async function fetchSessionContext(
  supabase: SupabaseClient,
  userId: string
): Promise<SessionContext> {
  const [studentStateResult, recurringMistakesResult, correctionMode] =
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
      fetchDefaultCorrectionMode(supabase, userId),
    ]);

  logQueryErrors("fetchSessionContext", [studentStateResult, recurringMistakesResult]);

  const studentState = studentStateResult.data as { level_score: string } | null;
  const recurringMistakes =
    (recurringMistakesResult.data as
      | { mistake_type: string; last_example: string | null }[]
      | null) ?? [];

  return {
    levelScore: studentState?.level_score ?? DEFAULT_LEVEL_SCORE,
    recurringMistakes: recurringMistakes.map((row) => ({
      mistakeType: row.mistake_type,
      lastExample: row.last_example,
    })),
    correctionMode,
  };
}
