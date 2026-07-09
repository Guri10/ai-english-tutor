import { describe, expect, test, vi } from "vitest";
import { summarizeSession } from "./summarize-session";

function fakeOpenAI(parsed: unknown) {
  const parseMock = vi.fn().mockResolvedValue({
    choices: [{ message: { parsed } }],
  });
  return {
    client: { chat: { completions: { parse: parseMock } } },
    parseMock,
  };
}

const transcript = [
  { turn: 1, speaker: "tutor" as const, text: "Hi there!" },
  { turn: 1, speaker: "student" as const, text: "I go to park yesterday." },
];

describe("summarizeSession", () => {
  test("returns the parsed structured-output summary", async () => {
    const summary = {
      levelScore: "A2",
      topicsCovered: ["weekend plans"],
      mistakes: [{ type: "past_tense", example: "I go", correction: "I went" }],
    };
    const { client } = fakeOpenAI(summary);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await summarizeSession(client as any, transcript);

    expect(result).toEqual(summary);
  });

  test("sends the transcript-derived prompt as a user message", async () => {
    const { client, parseMock } = fakeOpenAI({
      levelScore: "A1",
      topicsCovered: [],
      mistakes: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await summarizeSession(client as any, transcript);

    const [[callArgs]] = parseMock.mock.calls;
    expect(callArgs.messages[0].content).toContain("I go to park yesterday.");
  });

  test("throws when the model returns no parsed output", async () => {
    const { client } = fakeOpenAI(null);

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summarizeSession(client as any, transcript)
    ).rejects.toThrow();
  });
});
