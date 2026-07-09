import type { TranscriptEntry } from "@/lib/realtime/session-machine";

export function buildSummarizationPrompt(transcript: TranscriptEntry[]): string {
  const lines = transcript.map(
    (entry) => `${entry.speaker === "student" ? "Student" : "Tutor"}: ${entry.text}`
  );

  return [
    "You are grading a completed English-speaking practice transcript between a student and an AI tutor.",
    "Assess the student's overall CEFR level (A1-C2) shown in this conversation.",
    "List every distinct mistake the student made (grammar, vocabulary, word choice, etc.): a short type label, the exact student text it came from, and the correction.",
    "List the topics covered in the conversation.",
    "Transcript:",
    ...lines,
  ].join("\n");
}
