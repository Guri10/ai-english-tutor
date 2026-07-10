"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserClaims } from "@/lib/auth/get-user-claims";
import type { CorrectionMode, TranscriptEntry } from "@/lib/realtime/session-machine";
import { finalizeSession } from "@/lib/realtime/finalize-session";
import { createOpenAIClient } from "@/lib/openai/server-client";
import { getSessionSummary } from "@/lib/summarization/get-session-summary";
import type { SessionSummary } from "@/lib/summarization/session-summary-schema";

export type EndSessionInput = {
  sessionId: string;
  transcript: TranscriptEntry[];
  levelBefore: string;
  correctionMode: CorrectionMode;
  endedAt: string;
};

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export type EndPracticeSessionResult =
  | {
      ok: true;
      status: "completed";
      levelBefore: string;
      levelAfter: string;
      streakCount: number;
      mistakes: SessionSummary["mistakes"];
      correctedLiveCount: number;
    }
  | { ok: true; status: "pending_summary"; levelBefore: string }
  | { ok: false; error: string };

// The `sessions` row already exists by this point — created at connect time
// by POST /api/realtime-session (issue #6) — so this only finalizes it; see
// lib/realtime/finalize-session.ts for the shared summarize/apply/write
// logic also used by the maintenance route's abandoned-session sweep and
// pending_summary retry pass.
export async function endPracticeSession(
  input: EndSessionInput
): Promise<EndPracticeSessionResult> {
  const supabase = await createClient();
  const claims = await getUserClaims(supabase);
  if (!claims) {
    return { ok: false, error: "unauthorized" };
  }
  const userId = claims.sub as string;

  const openai = createOpenAIClient();
  const result = await finalizeSession({
    supabase,
    userId,
    sessionId: input.sessionId,
    transcript: input.transcript,
    levelBefore: input.levelBefore,
    endedAt: input.endedAt,
    correctionMode: input.correctionMode,
    getSummary: (transcript, levelBefore) =>
      getSessionSummary(openai, transcript, levelBefore),
  });

  // "skipped" only happens if the maintenance sweep's claim beat this call
  // by a hair (it decided the session looked abandoned right as the student
  // clicked "End") — the sweep owns finalizing it, so this just tells the
  // student the same "still processing" thing a pending_summary would.
  if (result.status === "skipped") {
    return { ok: true, status: "pending_summary", levelBefore: result.levelBefore };
  }
  return { ok: true, ...result };
}
