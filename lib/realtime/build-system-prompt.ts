export type RecurringMistakeForPrompt = {
  mistakeType: string;
  lastExample: string | null;
};

export type BuildSystemPromptInput = {
  levelScore: string;
  recurringMistakes: RecurringMistakeForPrompt[];
};

export function buildSystemPrompt({
  levelScore,
  recurringMistakes,
}: BuildSystemPromptInput): string {
  const lines = [
    "You are a friendly, patient English speaking tutor for students aged 10 and up.",
    `The student's current level is ${levelScore} on the CEFR scale. Choose a conversation scenario that matches this level — do not ask the student to pick one.`,
    "Open the conversation yourself with a short, scenario-appropriate spoken greeting.",
    "Keep your replies conversational and age-appropriate.",
  ];

  if (recurringMistakes.length > 0) {
    lines.push(
      "The student has these recurring mistake patterns — listen for them during the conversation:"
    );
    for (const mistake of recurringMistakes) {
      const example = mistake.lastExample
        ? ` (e.g. "${mistake.lastExample}")`
        : "";
      lines.push(`- ${mistake.mistakeType}${example}`);
    }
  }

  return lines.join("\n");
}
