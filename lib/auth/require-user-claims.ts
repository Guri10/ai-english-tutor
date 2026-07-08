import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireUserClaims(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/sign-in");
  }

  return data.claims;
}
