"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserClaims } from "@/lib/auth/get-user-claims";
import {
  buildSessionEndPayload,
  type EndSessionInput,
} from "@/lib/realtime/shape-session-end";
import type { TranscriptEntry } from "@/lib/realtime/session-machine";
import { createOpenAIClient } from "@/lib/openai/server-client";
import { summarizeSession } from "@/lib/summarization/summarize-session";
import {
  applySummary,
  type StudentStateSnapshot,
} from "@/lib/summarization/apply-summary";
import {
  CEFR_LEVELS,
  type SessionSummary,
} from "@/lib/summarization/session-summary-schema";
import { logQueryErrors } from "@/lib/supabase/log-query-errors";
import { DEFAULT_LEVEL_SCORE } from "@/lib/level";

const PENDING_SUMMARY_RESULT = (levelBefore: string): EndPracticeSessionResult => ({
  ok: true,
  status: "pending_summary",
  levelBefore,
});

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
      // How many tutor turns were tagged isCorrection (a real flag_correction
      // tool call, inline mode only) — lets the recap say "corrected N things
      // live" instead of a flat "no mistakes" when mistakes is empty only
      // because inline mode suppresses the summarization list, not because
      // nothing happened.
      correctedLiveCount: number;
    }
  | { ok: true; status: "pending_summary"; levelBefore: string }
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

  // Read concurrently with the (often multi-second) summarization call —
  // neither read depends on its output, only on userId.
  const [summary, studentStateResult, recurringMistakesResult] = await Promise.all([
    getSessionSummary(rawTranscript, input.levelBefore),
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
    // sessions.status keeps its schema default of 'pending_summary' — the
    // session and transcript are already safely persisted above, only the
    // progress-tracking update is deferred. No retry here — issue #6.
    return PENDING_SUMMARY_RESULT(input.levelBefore);
  }

  logQueryErrors("endPracticeSession: reading student state", [
    studentStateResult,
    recurringMistakesResult,
  ]);

  if (studentStateResult.error || recurringMistakesResult.error) {
    // A query error (not "no row yet") is indistinguishable from a brand-new
    // user's empty state unless checked explicitly — proceeding on the
    // default-user fallback would clobber a real user's progress with reset
    // values. Safer to defer, same as a summarization failure above.
    return PENDING_SUMMARY_RESULT(input.levelBefore);
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
    endedAt: input.endedAt,
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
      })
      .eq("id", session.id),
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

  logQueryErrors("endPracticeSession: applying summary", writeResults);

  if (writeResults.some((result) => result.error)) {
    // Partial failure: some of sessions/level_history/student_state/
    // recurring_mistakes may not have actually persisted. Don't tell the
    // student their progress is saved when we can't confirm it — same
    // "processing" state as a summarization failure, no retry here (#6).
    return PENDING_SUMMARY_RESULT(input.levelBefore);
  }

  return {
    ok: true,
    status: "completed",
    levelBefore: input.levelBefore,
    levelAfter: applied.studentStateUpdate.levelScore,
    streakCount: applied.studentStateUpdate.streakCount,
    // Inline mode already delivered corrections live (issue #5) — recurring_
    // mistakes/level_history/student_state still update the same either way,
    // only the recap's own mistakes list is mode-dependent.
    mistakes: input.correctionMode === "inline" ? [] : summary.mistakes,
    correctedLiveCount: rawTranscript.filter((entry) => entry.isCorrection).length,
  };
}

// A session with no exchanges skips the (costly, meaningless-on-empty-input)
// summarization call entirely, but still flows through applySummary as a
// trivial no-op summary so it's counted for total_sessions/streak like any
// other cleanly-ended session.
async function getSessionSummary(
  transcript: TranscriptEntry[],
  levelBefore: string
): Promise<SessionSummary | null> {
  if (transcript.length === 0) {
    return {
      levelScore: isCefrLevel(levelBefore) ? levelBefore : DEFAULT_LEVEL_SCORE,
      topicsCovered: [],
      mistakes: [],
    };
  }

  try {
    const openai = createOpenAIClient();
    return await summarizeSession(openai, transcript);
  } catch (error) {
    console.error("endPracticeSession: summarization failed", error);
    return null;
  }
}

function isCefrLevel(value: string): value is SessionSummary["levelScore"] {
  return (CEFR_LEVELS as readonly string[]).includes(value);
}
