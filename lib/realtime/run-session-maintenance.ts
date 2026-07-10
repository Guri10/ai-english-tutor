import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeSession } from "./finalize-session";
import type { CorrectionMode, TranscriptEntry } from "./session-machine";
import type { SessionSummary } from "@/lib/summarization/session-summary-schema";
import { DEFAULT_LEVEL_SCORE } from "@/lib/level";

// Spec §4: "a server-side sweep finalizes any session with no activity for
// 15 minutes" — the client's beforeunload/visibility heartbeat is the
// best-effort path; this is the backstop for when that never fires at all
// (browser killed, device loses power, etc).
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

// Friends-and-family scale — one pass comfortably finalizes everything
// found in practice. A hard cap just bounds a single invocation's runtime
// if something unexpected piles up, rather than being a real rate limit.
const BATCH_LIMIT = 25;

type SessionRow = {
  id: string;
  user_id: string;
  level_before: string | null;
  correction_mode_used: CorrectionMode;
};

export type RunSessionMaintenanceOptions = {
  supabase: SupabaseClient;
  getSummary: (
    transcript: TranscriptEntry[],
    levelBefore: string
  ) => Promise<SessionSummary | null>;
  now?: Date;
};

export type RunSessionMaintenanceResult = {
  abandonedFinalized: number;
  abandonedFound: number;
  pendingRetried: number;
  pendingFound: number;
};

export async function runSessionMaintenance({
  supabase,
  getSummary,
  now = new Date(),
}: RunSessionMaintenanceOptions): Promise<RunSessionMaintenanceResult> {
  const cutoff = new Date(now.getTime() - INACTIVITY_TIMEOUT_MS).toISOString();

  const [staleResult, pendingResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, user_id, level_before, correction_mode_used, last_activity_at")
      .eq("status", "active")
      .lt("last_activity_at", cutoff)
      .limit(BATCH_LIMIT),
    supabase
      .from("sessions")
      .select("id, user_id, level_before, correction_mode_used, ended_at")
      .eq("status", "pending_summary")
      .limit(BATCH_LIMIT),
  ]);

  const staleSessions = (staleResult.data ?? []) as (SessionRow & {
    last_activity_at: string;
  })[];
  const pendingSessions = (pendingResult.data ?? []) as (SessionRow & {
    ended_at: string | null;
  })[];

  let abandonedFinalized = 0;
  for (const session of staleSessions) {
    // expectedLastActivityAt: if a heartbeat bumped this since the SELECT
    // above, the claim inside finalizeSession fails and this session is
    // correctly left alone instead of being cut off mid-conversation.
    const result = await finalizeStoredSession(
      supabase,
      session,
      session.last_activity_at,
      getSummary,
      session.last_activity_at
    );
    if (result.status === "completed") abandonedFinalized++;
  }

  let pendingRetried = 0;
  for (const session of pendingSessions) {
    const result = await finalizeStoredSession(
      supabase,
      session,
      session.ended_at ?? now.toISOString(),
      getSummary
    );
    if (result.status === "completed") pendingRetried++;
  }

  return {
    abandonedFinalized,
    abandonedFound: staleSessions.length,
    pendingRetried,
    pendingFound: pendingSessions.length,
  };
}

async function finalizeStoredSession(
  supabase: SupabaseClient,
  session: SessionRow,
  endedAt: string,
  getSummary: RunSessionMaintenanceOptions["getSummary"],
  expectedLastActivityAt?: string
) {
  const transcript = await fetchTranscript(supabase, session.id);
  return finalizeSession({
    supabase,
    userId: session.user_id,
    sessionId: session.id,
    transcript,
    levelBefore: session.level_before ?? DEFAULT_LEVEL_SCORE,
    endedAt,
    correctionMode: session.correction_mode_used,
    getSummary,
    expectedLastActivityAt,
  });
}

async function fetchTranscript(
  supabase: SupabaseClient,
  sessionId: string
): Promise<TranscriptEntry[]> {
  const { data, error } = await supabase
    .from("session_transcripts")
    .select("raw_transcript")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("runSessionMaintenance: failed to read transcript", error);
  }

  return (data?.raw_transcript as TranscriptEntry[] | undefined) ?? [];
}
