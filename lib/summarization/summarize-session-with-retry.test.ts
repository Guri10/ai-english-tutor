import { describe, expect, test, vi } from "vitest";
import { summarizeSessionWithRetry } from "./summarize-session-with-retry";
import type { SessionSummary } from "./session-summary-schema";

const SUMMARY: SessionSummary = {
  levelScore: "A2",
  topicsCovered: ["ordering coffee"],
  mistakes: [],
};

describe("summarizeSessionWithRetry", () => {
  test("returns the result on the first try without sleeping", async () => {
    const summarize = vi.fn().mockResolvedValue(SUMMARY);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await summarizeSessionWithRetry(summarize, {
      maxAttempts: 3,
      sleep,
    });

    expect(result).toEqual(SUMMARY);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("retries on failure and returns the eventual success", async () => {
    const summarize = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockRejectedValueOnce(new Error("still rate limited"))
      .mockResolvedValueOnce(SUMMARY);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await summarizeSessionWithRetry(summarize, {
      maxAttempts: 3,
      sleep,
    });

    expect(result).toEqual(SUMMARY);
    expect(summarize).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test("backs off with increasing delays", async () => {
    const summarize = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce(SUMMARY);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await summarizeSessionWithRetry(summarize, { maxAttempts: 3, sleep, baseDelayMs: 1000 });

    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });

  test("returns null after exhausting all attempts", async () => {
    const summarize = vi.fn().mockRejectedValue(new Error("permanent failure"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await summarizeSessionWithRetry(summarize, {
      maxAttempts: 3,
      sleep,
    });

    expect(result).toBeNull();
    expect(summarize).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // never sleeps after the last attempt
  });
});
