import type OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { TranscriptEntry } from "@/lib/realtime/session-machine";
import { buildSummarizationPrompt } from "./build-summarization-prompt";
import { sessionSummarySchema, type SessionSummary } from "./session-summary-schema";

const SUMMARIZATION_MODEL = "gpt-4.1-mini";

export async function summarizeSession(
  openai: OpenAI,
  transcript: TranscriptEntry[]
): Promise<SessionSummary> {
  const completion = await openai.chat.completions.parse({
    model: SUMMARIZATION_MODEL,
    messages: [{ role: "user", content: buildSummarizationPrompt(transcript) }],
    response_format: zodResponseFormat(sessionSummarySchema, "session_summary"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("summarizeSession: model returned no parsed output");
  }
  return parsed;
}
