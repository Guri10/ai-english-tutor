import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionMode, TranscriptEntry } from "./session-machine";
import {
  applySummary,
  type StudentStateSnapshot,
} from "@/lib/summarization/apply-summary";
import type { SessionSummary } from "@/lib/summarization/session-summary-schema";
import { logQueryErrors } from "@/lib/supabase/log-query-errors";
import { DEFAULT_LEVEL_SCORE } from "@/lib/level";

export type FinalizeSessionInput = {
  supabase: SupabaseClient;
  userId: string;
  sessionId: string;
  transcript: TranscriptEntry[];
  levelBefore: string;
  endedAt: string;
  correctionMode: CorrectionMode;
  // Sweep-only optimistic-concurrency guard: the claim only succeeds if
  // last_activity_at still matches what the caller observed when it decided
  // this session looked abandoned. If a heartbeat bumped it in the meantime,
  // the session isn't actually abandoned anymore — the claim (correctly)
  // fails and finalization backs off rather than cutting off a live session.
  // Omitted by endPracticeSession's normal-end call, which has no such
  // staleness concept to guard.
  expectedLastActivityAt?: string;
  // Injected rather than called directly so this function stays agnostic
  // to *why* a summary might be unavailable (API failure after retries,
  // etc.) and easy to unit test without a real OpenAI client.
  getSummary: (
    transcript: TranscriptEntry[],
    levelBefore: string
  ) => Promise<SessionSummary | null>;
};

export type FinalizeSessionResult =
  | {
      status: "completed";
      levelBefore: string;
      levelAfter: string;
      streakCount: number;
      mistakes: SessionSummary["mistakes"];
      // How many tutor turns were tagged isCorrection (a real flag_correction
      // tool call, inline mode only) — lets the recap say "corrected N things
      // live" instead of a flat "no mistakes" when mistakes is empty only
      // because inline mode suppresses the summarization list.
      correctedLiveCount: number;
    }
  | { status: "pending_summary"; levelBefore: string }
  // Lost the atomic claim: another finalize call (the sweep vs. a normal
  // endPracticeSession, or two overlapping sweep runs) already claimed —
  // or, for a sweep call, is finishing — this exact session. The caller
  // does nothing further; whoever won the claim owns writing the outcome.
  | { status: "skipped"; levelBefore: string };

const PENDING_SUMMARY_RESULT = (levelBefore: string): FinalizeSessionResult => ({
  status: "pending_summary",
  levelBefore,
});

// The one place a session (ended normally via endPracticeSession, or
// finalized by the maintenance route's abandoned-session sweep / pending_
// summary retry pass — issue #6) gets summarized and its progress-tracking
// tables updated. The `sessions` row itself already exists by the time this
// runs — created at connect time (issue #6), not here — so this only
// updates it, never inserts.
export async function finalizeSession(
  input: FinalizeSessionInput
): Promise<FinalizeSessionResult> {
  const { supabase, userId, sessionId, transcript, levelBefore, endedAt, correctionMode } =
    input;

  // Atomic claim: flips status to the transient 'finalizing' state only if
  // it's still 'active' or 'pending_summary' (and, for the sweep,
  // last_activity_at hasn't moved since it was observed). This is what
  // makes finalization run-once — without it, the sweep and a normal
  // session end (or two overlapping sweep runs) racing on the same session
  // would both summarize and both write level_history/student_state.
  let claimQuery = supabase
    .from("sessions")
    .update({ status: "finalizing" })
    .eq("id", sessionId)
    .in("status", ["active", "pending_summary"]);
  if (input.expectedLastActivityAt) {
    claimQuery = claimQuery.eq("last_activity_at", input.expectedLastActivityAt);
  }
  const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
  if (claimError) {
    console.error("finalizeSession: failed to claim session", claimError);
  }
  if (claimError || !claimed) {
    return { status: "skipped", levelBefore };
  }

  const { error: transcriptError } = await supabase
    .from("session_transcripts")
    .upsert(
      { session_id: sessionId, raw_transcript: transcript },
      { onConflict: "session_id" }
    );

  if (transcriptError) {
    console.error("finalizeSession: failed to sync transcript", transcriptError);
    return PENDING_SUMMARY_RESULT(levelBefore);
  }

  // Read concurrently with the (often multi-second) summarization call —
  // neither read depends on its output, only on userId.
  const [summary, studentStateResult, recurringMistakesResult] = await Promise.all([
    input.getSummary(transcript, levelBefore),
    supabase
      .from("student_state")
      .select("level_score, streak_count, longest_streak, total_sessions, last_session_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("recurring_mistakes")
      .select("mistake_type, occurrence_count")
      .eq("user_id", userId),
  ]);

  if (!summary) {
    await markPendingSummary(supabase, sessionId, endedAt);
    return PENDING_SUMMARY_RESULT(levelBefore);
  }

  logQueryErrors("finalizeSession: reading student state", [
    studentStateResult,
    recurringMistakesResult,
  ]);

  if (studentStateResult.error || recurringMistakesResult.error) {
    // A query error (not "no row yet") is indistinguishable from a brand-new
    // user's empty state unless checked explicitly — proceeding on the
    // default-user fallback would clobber a real user's progress with reset
    // values. Safer to defer, same as a summarization failure above.
    await markPendingSummary(supabase, sessionId, endedAt);
    return PENDING_SUMMARY_RESULT(levelBefore);
  }

  const studentStateRow = studentStateResult.data as {
    level_score: string;
    streak_count: number;
    longest_streak: number;
    total_sessions: number;
    last_session_at: string | null;
  } | null;

  const studentState: StudentStateSnapshot = studentStateRow
    ? {
        levelScore: studentStateRow.level_score,
        streakCount: studentStateRow.streak_count,
        longestStreak: studentStateRow.longest_streak,
        totalSessions: studentStateRow.total_sessions,
        lastSessionAt: studentStateRow.last_session_at,
      }
    : {
        levelScore: DEFAULT_LEVEL_SCORE,
        streakCount: 0,
        longestStreak: 0,
        totalSessions: 0,
        lastSessionAt: null,
      };

  const existingMistakeCounts = Object.fromEntries(
    ((recurringMistakesResult.data as
      | { mistake_type: string; occurrence_count: number }[]
      | null) ?? []
    ).map((row) => [row.mistake_type, row.occurrence_count])
  );

  const applied = applySummary({
    summary,
    studentState,
    existingMistakeCounts,
    endedAt,
  });

  const recurringMistakesUpsert =
    applied.recurringMistakeUpserts.length > 0
      ? supabase.from("recurring_mistakes").upsert(
          applied.recurringMistakeUpserts.map((upsert) => ({
            user_id: userId,
            mistake_type: upsert.mistakeType,
            occurrence_count: upsert.occurrenceCount,
            last_example: upsert.lastExample,
            last_seen_at: upsert.lastSeenAt,
          })),
          { onConflict: "user_id,mistake_type" }
        )
      : Promise.resolve({ error: null });

  const writeResults = await Promise.all([
    supabase
      .from("sessions")
      .update({
        status: applied.sessionUpdate.status,
        level_after: applied.sessionUpdate.levelAfter,
        scenario_topic: applied.sessionUpdate.scenarioTopic,
        ended_at: endedAt,
      })
      .eq("id", sessionId),
    supabase.from("level_history").insert({
      user_id: userId,
      level_score: applied.levelHistoryInsert.levelScore,
      recorded_at: applied.levelHistoryInsert.recordedAt,
    }),
    supabase.from("student_state").upsert({
      user_id: userId,
      level_score: applied.studentStateUpdate.levelScore,
      streak_count: applied.studentStateUpdate.streakCount,
      longest_streak: applied.studentStateUpdate.longestStreak,
      total_sessions: applied.studentStateUpdate.totalSessions,
      last_session_at: applied.studentStateUpdate.lastSessionAt,
    }),
    recurringMistakesUpsert,
  ]);

  logQueryErrors("finalizeSession: applying summary", writeResults);

  if (writeResults.some((result) => result.error)) {
    // Partial failure: some of sessions/level_history/student_state/
    // recurring_mistakes may not have actually persisted. Don't tell the
    // student their progress is saved when we can't confirm it.
    await markPendingSummary(supabase, sessionId, endedAt);
    return PENDING_SUMMARY_RESULT(levelBefore);
  }

  return {
    status: "completed",
    levelBefore,
    levelAfter: applied.studentStateUpdate.levelScore,
    streakCount: applied.studentStateUpdate.streakCount,
    // Inline mode already delivered corrections live (issue #5) — recurring_
    // mistakes/level_history/student_state still update the same either way,
    // only the recap's own mistakes list is mode-dependent.
    mistakes: correctionMode === "inline" ? [] : summary.mistakes,
    correctedLiveCount: transcript.filter((entry) => entry.isCorrection).length,
  };
}

// Explicitly moves a stale 'active' row (found by the sweep) into
// 'pending_summary' so the maintenance route's retry pass — not the sweep's
// inactivity check — is what revisits it from here on, and records ended_at
// so a session that will never get a real endSession() call still has one.
async function markPendingSummary(
  supabase: SupabaseClient,
  sessionId: string,
  endedAt: string
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ status: "pending_summary", ended_at: endedAt })
    .eq("id", sessionId);
  if (error) {
    console.error("finalizeSession: failed to mark session pending_summary", error);
  }
}
