"use server";

import { createClient } from "@/lib/supabase/server";
import { buildAuthCallbackUrl } from "@/lib/auth/route-guard";

export type MagicLinkState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function requestMagicLink(
  _prevState: MagicLinkState,
  formData: FormData
): Promise<MagicLinkState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { status: "error", message: "Enter your email address." };
  }

  const redirectTo = formData.get("redirectTo");
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const emailRedirectTo = buildAuthCallbackUrl(
    siteUrl,
    typeof redirectTo === "string" ? redirectTo : null
  );
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    return { status: "error", message: error.message };
  }
  return { status: "sent" };
}
