import type { SupabaseClient } from "@supabase/supabase-js";

export async function getUserClaims(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
}
