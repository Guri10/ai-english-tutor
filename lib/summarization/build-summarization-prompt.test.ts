import { describe, expect, test } from "vitest";
import { buildSummarizationPrompt } from "./build-summarization-prompt";

describe("buildSummarizationPrompt", () => {
  test("renders each transcript entry with its speaker labeled", () => {
    const prompt = buildSummarizationPrompt([
      { turn: 1, speaker: "tutor", text: "Hi! Tell me about your weekend." },
      { turn: 1, speaker: "student", text: "I go to the park yesterday." },
    ]);

    expect(prompt).toContain("Tutor: Hi! Tell me about your weekend.");
    expect(prompt).toContain("Student: I go to the park yesterday.");
  });

  test("instructs the model to assess level, mistakes, and topics", () => {
    const prompt = buildSummarizationPrompt([
      { turn: 1, speaker: "student", text: "Hello." },
    ]);

    expect(prompt).toMatch(/CEFR/i);
    expect(prompt).toMatch(/mistake/i);
    expect(prompt).toMatch(/topic/i);
  });
});
