import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClaims } from "./get-user-claims";

export async function requireUserClaims(supabase: SupabaseClient) {
  const claims = await getUserClaims(supabase);

  if (!claims) {
    redirect("/sign-in");
  }

  return claims;
}
