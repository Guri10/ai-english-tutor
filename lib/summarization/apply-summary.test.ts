import { describe, expect, test } from "vitest";
import { applySummary } from "./apply-summary";

const baseStudentState = {
  levelScore: "A2",
  streakCount: 3,
  longestStreak: 5,
  totalSessions: 10,
  lastSessionAt: "2026-07-07T09:00:00.000Z",
};

const baseSummary = {
  levelScore: "B1" as const,
  topicsCovered: ["ordering coffee", "weekend plans"],
  mistakes: [
    { type: "article_usage", example: "I saw a elephant.", correction: "I saw an elephant." },
    { type: "past_tense", example: "I goed home.", correction: "I went home." },
  ],
};

describe("applySummary", () => {
  test("builds a completed session update from the summary", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: baseStudentState,
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.sessionUpdate).toEqual({
      status: "completed",
      levelAfter: "B1",
      scenarioTopic: "ordering coffee, weekend plans",
    });
  });

  test("sets scenarioTopic to null when no topics were covered", () => {
    const result = applySummary({
      summary: { ...baseSummary, topicsCovered: [] },
      studentState: baseStudentState,
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.sessionUpdate.scenarioTopic).toBeNull();
  });

  test("appends a level_history row at the new level", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: baseStudentState,
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.levelHistoryInsert).toEqual({
      levelScore: "B1",
      recordedAt: "2026-07-08T09:00:00.000Z",
    });
  });

  test("groups mistakes by type into recurring_mistakes upserts, starting fresh types at this session's count", () => {
    const result = applySummary({
      summary: {
        ...baseSummary,
        mistakes: [
          { type: "article_usage", example: "a elephant", correction: "an elephant" },
          { type: "article_usage", example: "a apple", correction: "an apple" },
          { type: "past_tense", example: "I goed", correction: "I went" },
        ],
      },
      studentState: baseStudentState,
      existingMistakeCounts: {},
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.recurringMistakeUpserts).toEqual([
      {
        mistakeType: "article_usage",
        occurrenceCount: 2,
        lastExample: "a apple",
        lastSeenAt: "2026-07-08T09:00:00.000Z",
      },
      {
        mistakeType: "past_tense",
        occurrenceCount: 1,
        lastExample: "I goed",
        lastSeenAt: "2026-07-08T09:00:00.000Z",
      },
    ]);
  });

  test("adds this session's count on top of an existing recurring_mistakes row", () => {
    const result = applySummary({
      summary: {
        ...baseSummary,
        mistakes: [
          { type: "article_usage", example: "a elephant", correction: "an elephant" },
        ],
      },
      studentState: baseStudentState,
      existingMistakeCounts: { article_usage: 5 },
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.recurringMistakeUpserts).toEqual([
      {
        mistakeType: "article_usage",
        occurrenceCount: 6,
        lastExample: "a elephant",
        lastSeenAt: "2026-07-08T09:00:00.000Z",
      },
    ]);
  });

  test("produces no recurring_mistakes upserts when the summary has no mistakes", () => {
    const result = applySummary({
      summary: { ...baseSummary, mistakes: [] },
      studentState: baseStudentState,
      existingMistakeCounts: {},
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.recurringMistakeUpserts).toEqual([]);
  });

  test("updates student_state's level, total_sessions, and last_session_at", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: baseStudentState,
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.studentStateUpdate.levelScore).toBe("B1");
    expect(result.studentStateUpdate.totalSessions).toBe(11);
    expect(result.studentStateUpdate.lastSessionAt).toBe("2026-07-08T09:00:00.000Z");
  });

  test("streak: first session ever (no lastSessionAt) starts the streak at 1", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: { ...baseStudentState, lastSessionAt: null, streakCount: 0, longestStreak: 0 },
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.studentStateUpdate.streakCount).toBe(1);
    expect(result.studentStateUpdate.longestStreak).toBe(1);
  });

  test("streak: a second session on the same UTC day leaves the streak unchanged", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: { ...baseStudentState, lastSessionAt: "2026-07-08T01:00:00.000Z", streakCount: 3 },
      endedAt: "2026-07-08T22:00:00.000Z",
    });

    expect(result.studentStateUpdate.streakCount).toBe(3);
  });

  test("streak: a session exactly one UTC day after the last one extends the streak", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: { ...baseStudentState, lastSessionAt: "2026-07-07T23:00:00.000Z", streakCount: 3 },
      endedAt: "2026-07-08T01:00:00.000Z",
    });

    expect(result.studentStateUpdate.streakCount).toBe(4);
  });

  test("streak: extending past the current longest_streak raises longest_streak too", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: { ...baseStudentState, lastSessionAt: "2026-07-07T23:00:00.000Z", streakCount: 5, longestStreak: 5 },
      endedAt: "2026-07-08T01:00:00.000Z",
    });

    expect(result.studentStateUpdate.streakCount).toBe(6);
    expect(result.studentStateUpdate.longestStreak).toBe(6);
  });

  test("streak: a gap of more than one day resets the streak to 1", () => {
    const result = applySummary({
      summary: baseSummary,
      studentState: { ...baseStudentState, lastSessionAt: "2026-07-01T09:00:00.000Z", streakCount: 8, longestStreak: 8 },
      endedAt: "2026-07-08T09:00:00.000Z",
    });

    expect(result.studentStateUpdate.streakCount).toBe(1);
    expect(result.studentStateUpdate.longestStreak).toBe(8);
  });
});
