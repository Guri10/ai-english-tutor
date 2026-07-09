import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionMode } from "./session-machine";
import { logQueryErrors } from "@/lib/supabase/log-query-errors";

export const DEFAULT_CORRECTION_MODE: CorrectionMode = "inline";

export async function fetchDefaultCorrectionMode(
  supabase: SupabaseClient,
  userId: string
): Promise<CorrectionMode> {
  const result = await supabase
    .from("profiles")
    .select("correction_mode")
    .eq("id", userId)
    .maybeSingle();

  logQueryErrors("fetchDefaultCorrectionMode", [result]);

  const profile = result.data as { correction_mode: CorrectionMode } | null;
  return profile?.correction_mode ?? DEFAULT_CORRECTION_MODE;
}
