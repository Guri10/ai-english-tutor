import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_DAILY_SESSION_CAP,
  getDailySessionCap,
  isDailySessionCapExceeded,
  utcDayStartIso,
} from "./check-daily-session-cap";

describe("isDailySessionCapExceeded", () => {
  test("is not exceeded when today's count is below the cap", () => {
    expect(isDailySessionCapExceeded(9, 10)).toBe(false);
  });

  test("is exceeded once today's count reaches the cap", () => {
    expect(isDailySessionCapExceeded(10, 10)).toBe(true);
  });

  test("is exceeded when today's count is already past the cap", () => {
    expect(isDailySessionCapExceeded(11, 10)).toBe(true);
  });

  test("zero sessions today is never exceeded, even with a zero cap edge case", () => {
    expect(isDailySessionCapExceeded(0, 10)).toBe(false);
  });

  test("default cap is 10", () => {
    expect(DEFAULT_DAILY_SESSION_CAP).toBe(10);
  });
});

describe("getDailySessionCap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("falls back to the default when DAILY_SESSION_CAP is unset", () => {
    vi.stubEnv("DAILY_SESSION_CAP", "");
    expect(getDailySessionCap()).toBe(DEFAULT_DAILY_SESSION_CAP);
  });

  test("uses a configured positive integer", () => {
    vi.stubEnv("DAILY_SESSION_CAP", "25");
    expect(getDailySessionCap()).toBe(25);
  });

  test("falls back to the default for a garbage value", () => {
    vi.stubEnv("DAILY_SESSION_CAP", "not-a-number");
    expect(getDailySessionCap()).toBe(DEFAULT_DAILY_SESSION_CAP);
  });

  test("falls back to the default for a non-positive value", () => {
    vi.stubEnv("DAILY_SESSION_CAP", "0");
    expect(getDailySessionCap()).toBe(DEFAULT_DAILY_SESSION_CAP);
  });
});

describe("utcDayStartIso", () => {
  test("returns midnight UTC for the given date", () => {
    const now = new Date("2026-07-09T18:42:31.123Z");
    expect(utcDayStartIso(now)).toBe("2026-07-09T00:00:00.000Z");
  });

  test("does not roll over based on local timezone offsets", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(utcDayStartIso(now)).toBe("2026-01-01T00:00:00.000Z");
  });
});
