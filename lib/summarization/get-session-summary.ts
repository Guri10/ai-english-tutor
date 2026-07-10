import type OpenAI from "openai";
import type { TranscriptEntry } from "@/lib/realtime/session-machine";
import { DEFAULT_LEVEL_SCORE } from "@/lib/level";
import { summarizeSession } from "./summarize-session";
import { summarizeSessionWithRetry } from "./summarize-session-with-retry";
import { CEFR_LEVELS, type SessionSummary } from "./session-summary-schema";

// A session with no exchanges skips the (costly, meaningless-on-empty-input)
// summarization call entirely, but still flows through applySummary as a
// trivial no-op summary so it's counted for total_sessions/streak like any
// other cleanly-ended session. Shared by endPracticeSession and the
// maintenance route (issue #6) so both retry identically on real failures.
export async function getSessionSummary(
  openai: OpenAI,
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

  return summarizeSessionWithRetry(() => summarizeSession(openai, transcript));
}

function isCefrLevel(value: string): value is SessionSummary["levelScore"] {
  return (CEFR_LEVELS as readonly string[]).includes(value);
}
