import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./build-system-prompt";

describe("buildSystemPrompt", () => {
  it("includes the student's CEFR level so the model can pick a matching scenario", () => {
    const prompt = buildSystemPrompt({
      levelScore: "B1",
      recurringMistakes: [],
      correctionMode: "summary",
    });
    expect(prompt).toContain("B1");
  });

  it("instructs the model to choose the scenario itself, not offer a picker", () => {
    const prompt = buildSystemPrompt({
      levelScore: "A1",
      recurringMistakes: [],
      correctionMode: "summary",
    });
    expect(prompt.toLowerCase()).toContain("choose");
  });

  it("lists known recurring mistakes for the model to listen for", () => {
    const prompt = buildSystemPrompt({
      levelScore: "A2",
      recurringMistakes: [
        { mistakeType: "article_usage", lastExample: "I saw a elephant" },
        { mistakeType: "past_tense", lastExample: null },
      ],
      correctionMode: "summary",
    });
    expect(prompt).toContain("article_usage");
    expect(prompt).toContain("I saw a elephant");
    expect(prompt).toContain("past_tense");
  });

  it("omits the recurring-mistakes section entirely for a brand-new student", () => {
    const prompt = buildSystemPrompt({
      levelScore: "A1",
      recurringMistakes: [],
      correctionMode: "summary",
    });
    expect(prompt.toLowerCase()).not.toContain("recurring mistake");
  });

  it("mentions ages 10+ so tone/content stays age-appropriate", () => {
    const prompt = buildSystemPrompt({
      levelScore: "A1",
      recurringMistakes: [],
      correctionMode: "summary",
    });
    expect(prompt).toMatch(/age|kid|young|10/i);
  });

  describe("correction mode", () => {
    it("inline mode instructs the model to correct live and call the flag_correction tool", () => {
      const prompt = buildSystemPrompt({
        levelScore: "A1",
        recurringMistakes: [],
        correctionMode: "inline",
      });
      expect(prompt.toLowerCase()).toContain("flag_correction");
      expect(prompt).toMatch(/correct/i);
    });

    it("summary mode instructs the model never to correct mid-conversation", () => {
      const prompt = buildSystemPrompt({
        levelScore: "A1",
        recurringMistakes: [],
        correctionMode: "summary",
      });
      expect(prompt.toLowerCase()).not.toContain("flag_correction");
      expect(prompt.toLowerCase()).toMatch(/never correct|don't correct|do not correct/);
    });
  });
});
