"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserClaims } from "@/lib/auth/get-user-claims";
import {
  buildSessionEndPayload,
  type EndSessionInput,
} from "@/lib/realtime/shape-session-end";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export type EndPracticeSessionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function endPracticeSession(
  input: EndSessionInput
): Promise<EndPracticeSessionResult> {
  const supabase = await createClient();
  const claims = await getUserClaims(supabase);
  if (!claims) {
    return { ok: false, error: "unauthorized" };
  }
  const userId = claims.sub as string;

  const { sessionRow, rawTranscript } = buildSessionEndPayload(userId, input);

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert(sessionRow)
    .select("id")
    .single();

  if (sessionError || !session) {
    console.error("endPracticeSession: failed to insert session row", sessionError);
    return { ok: false, error: "failed to save session" };
  }

  const { error: transcriptError } = await supabase
    .from("session_transcripts")
    .insert({ session_id: session.id, raw_transcript: rawTranscript });

  if (transcriptError) {
    console.error(
      "endPracticeSession: failed to insert transcript",
      transcriptError
    );
    return { ok: false, error: "failed to save transcript" };
  }

  return { ok: true };
}
