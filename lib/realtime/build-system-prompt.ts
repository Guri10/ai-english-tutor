import { FLAG_CORRECTION_TOOL_NAME, type CorrectionMode } from "./session-machine";

export type RecurringMistakeForPrompt = {
  mistakeType: string;
  lastExample: string | null;
};

export type BuildSystemPromptInput = {
  levelScore: string;
  recurringMistakes: RecurringMistakeForPrompt[];
  correctionMode: CorrectionMode;
};

export function buildSystemPrompt({
  levelScore,
  recurringMistakes,
  correctionMode,
}: BuildSystemPromptInput): string {
  const lines = [
    "You are a friendly, patient English speaking tutor for students aged 10 and up.",
    `The student's current level is ${levelScore} on the CEFR scale. Choose a conversation scenario that matches this level — do not ask the student to pick one.`,
    "Open the conversation yourself with a short, scenario-appropriate spoken greeting.",
    "Keep your replies conversational and age-appropriate.",
    ...(correctionMode === "inline"
      ? [
          "When the student makes a mistake, briefly correct it right after it happens — a quick, friendly aside (e.g. \"quick note — it's 'I went', not 'I goed'\") — then continue the scenario naturally.",
          `Every time you deliver a correction like this, silently call the ${FLAG_CORRECTION_TOOL_NAME} tool with the mistake type, what the student said, and the correction. Don't mention the tool or that you're calling it.`,
        ]
      : [
          "Never correct the student mid-conversation, no matter what mistakes you notice — just continue the conversation naturally. Their mistakes will be reviewed after the session ends.",
        ]),
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
