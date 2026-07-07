"use server";

import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) {
    return { status: "error", message: error.message };
  }
  return { status: "sent" };
}
