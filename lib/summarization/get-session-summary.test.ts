import { describe, expect, test, vi } from "vitest";
import type OpenAI from "openai";
import { getSessionSummary } from "./get-session-summary";
import type { TranscriptEntry } from "@/lib/realtime/session-machine";

const summarizeSessionMock = vi.fn();
vi.mock("./summarize-session", () => ({
  summarizeSession: (...args: unknown[]) => summarizeSessionMock(...args),
}));

const transcript: TranscriptEntry[] = [
  { turn: 1, speaker: "student", text: "Hello" },
  { turn: 1, speaker: "tutor", text: "Hi there!" },
];

describe("getSessionSummary", () => {
  test("skips summarization for an empty transcript and echoes back a valid levelBefore", async () => {
    const result = await getSessionSummary({} as OpenAI, [], "B1");

    expect(summarizeSessionMock).not.toHaveBeenCalled();
    expect(result).toEqual({ levelScore: "B1", topicsCovered: [], mistakes: [] });
  });

  test("falls back to the default level for an empty transcript with an invalid levelBefore", async () => {
    const result = await getSessionSummary({} as OpenAI, [], "not-a-real-level");

    expect(result).toEqual({ levelScore: "A1", topicsCovered: [], mistakes: [] });
  });

  test("delegates to summarizeSession (with retry) for a non-empty transcript", async () => {
    summarizeSessionMock.mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    });

    const result = await getSessionSummary({} as OpenAI, transcript, "A1");

    expect(summarizeSessionMock).toHaveBeenCalledWith(expect.anything(), transcript);
    expect(result).toEqual({ levelScore: "A2", topicsCovered: [], mistakes: [] });
  });

  test("returns null when summarization keeps failing", async () => {
    vi.useFakeTimers();
    summarizeSessionMock.mockRejectedValue(new Error("network down"));

    const resultPromise = getSessionSummary({} as OpenAI, transcript, "A1");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeNull();
    vi.useRealTimers();
  });
});
