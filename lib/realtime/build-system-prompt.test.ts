import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./build-system-prompt";

describe("buildSystemPrompt", () => {
  it("includes the student's CEFR level so the model can pick a matching scenario", () => {
    const prompt = buildSystemPrompt({ levelScore: "B1", recurringMistakes: [] });
    expect(prompt).toContain("B1");
  });

  it("instructs the model to choose the scenario itself, not offer a picker", () => {
    const prompt = buildSystemPrompt({ levelScore: "A1", recurringMistakes: [] });
    expect(prompt.toLowerCase()).toContain("choose");
  });

  it("lists known recurring mistakes for the model to listen for", () => {
    const prompt = buildSystemPrompt({
      levelScore: "A2",
      recurringMistakes: [
        { mistakeType: "article_usage", lastExample: "I saw a elephant" },
        { mistakeType: "past_tense", lastExample: null },
      ],
    });
    expect(prompt).toContain("article_usage");
    expect(prompt).toContain("I saw a elephant");
    expect(prompt).toContain("past_tense");
  });

  it("omits the recurring-mistakes section entirely for a brand-new student", () => {
    const prompt = buildSystemPrompt({ levelScore: "A1", recurringMistakes: [] });
    expect(prompt.toLowerCase()).not.toContain("recurring mistake");
  });

  it("mentions ages 10+ so tone/content stays age-appropriate", () => {
    const prompt = buildSystemPrompt({ levelScore: "A1", recurringMistakes: [] });
    expect(prompt).toMatch(/age|kid|young|10/i);
  });
});
