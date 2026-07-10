import { describe, expect, test, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSessionMaintenance } from "./run-session-maintenance";

const activeLtLimitMock = vi.fn();
const pendingLimitMock = vi.fn();
const transcriptMaybeSingleMock = vi.fn();
const finalizeUpdateEqMock = vi.fn();
const sessionsClaimMaybeSingleMock = vi.fn();

function mockSupabase(): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === "sessions") {
      return {
        select: () => ({
          eq: (_col: string, value: string) => {
            if (value === "active") {
              return { lt: () => ({ limit: activeLtLimitMock }) };
            }
            return { limit: pendingLimitMock };
          },
        }),
        // finalizeSession's atomic claim (see finalize-session.test.ts for
        // why this dispatches on the update payload) vs. a plain terminal
        // write.
        update: (payload: { status: string }) => {
          if (payload.status === "finalizing") {
            const claimChain = {
              eq: () => claimChain,
              in: () => claimChain,
              select: () => ({ maybeSingle: sessionsClaimMaybeSingleMock }),
            };
            return claimChain;
          }
          return { eq: finalizeUpdateEqMock };
        },
      };
    }
    if (table === "session_transcripts") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: transcriptMaybeSingleMock }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === "student_state") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === "recurring_mistakes") {
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === "level_history") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from } as unknown as SupabaseClient;
}

const getSummary = vi.fn();

describe("runSessionMaintenance", () => {
  beforeEach(() => {
    activeLtLimitMock.mockReset().mockResolvedValue({ data: [], error: null });
    pendingLimitMock.mockReset().mockResolvedValue({ data: [], error: null });
    transcriptMaybeSingleMock.mockReset().mockResolvedValue({
      data: { raw_transcript: [] },
      error: null,
    });
    finalizeUpdateEqMock.mockReset().mockResolvedValue({ error: null });
    sessionsClaimMaybeSingleMock
      .mockReset()
      .mockResolvedValue({ data: { id: "claimed" }, error: null });
    getSummary.mockReset().mockResolvedValue({
      levelScore: "A2",
      topicsCovered: [],
      mistakes: [],
    });
  });

  test("returns zero counts when nothing is stale or pending", async () => {
    const result = await runSessionMaintenance({ supabase: mockSupabase(), getSummary });

    expect(result).toEqual({
      abandonedFinalized: 0,
      abandonedFound: 0,
      pendingRetried: 0,
      pendingFound: 0,
    });
    expect(getSummary).not.toHaveBeenCalled();
  });

  test("finalizes a stale active session using its last-synced transcript", async () => {
    activeLtLimitMock.mockResolvedValue({
      data: [
        {
          id: "session-1",
          user_id: "user-1",
          level_before: "A1",
          correction_mode_used: "summary",
          last_activity_at: "2026-07-09T10:00:00.000Z",
        },
      ],
      error: null,
    });
    transcriptMaybeSingleMock.mockResolvedValue({
      data: { raw_transcript: [{ turn: 1, speaker: "student", text: "hi" }] },
      error: null,
    });

    const result = await runSessionMaintenance({ supabase: mockSupabase(), getSummary });

    expect(result.abandonedFound).toBe(1);
    expect(result.abandonedFinalized).toBe(1);
    expect(getSummary).toHaveBeenCalledWith(
      [{ turn: 1, speaker: "student", text: "hi" }],
      "A1"
    );
  });

  test("retries a pending_summary session and counts it only if it completes", async () => {
    pendingLimitMock.mockResolvedValue({
      data: [
        {
          id: "session-2",
          user_id: "user-2",
          level_before: "B1",
          correction_mode_used: "inline",
          ended_at: "2026-07-09T09:00:00.000Z",
        },
      ],
      error: null,
    });
    getSummary.mockResolvedValueOnce(null); // still fails this round

    const result = await runSessionMaintenance({ supabase: mockSupabase(), getSummary });

    expect(result.pendingFound).toBe(1);
    expect(result.pendingRetried).toBe(0);
  });

  test("leaves a stale session alone when a heartbeat bumped last_activity_at since it was selected (claim fails)", async () => {
    activeLtLimitMock.mockResolvedValue({
      data: [
        {
          id: "session-revived",
          user_id: "user-1",
          level_before: "A1",
          correction_mode_used: "summary",
          last_activity_at: "2026-07-09T10:00:00.000Z",
        },
      ],
      error: null,
    });
    sessionsClaimMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await runSessionMaintenance({ supabase: mockSupabase(), getSummary });

    expect(result.abandonedFound).toBe(1);
    expect(result.abandonedFinalized).toBe(0);
    expect(getSummary).not.toHaveBeenCalled();
  });

  test("falls back to A1 when a stale session has no level_before recorded", async () => {
    activeLtLimitMock.mockResolvedValue({
      data: [
        {
          id: "session-3",
          user_id: "user-3",
          level_before: null,
          correction_mode_used: "summary",
          last_activity_at: "2026-07-09T10:00:00.000Z",
        },
      ],
      error: null,
    });

    await runSessionMaintenance({ supabase: mockSupabase(), getSummary });

    expect(getSummary).toHaveBeenCalledWith([], "A1");
  });

  test("uses now() as ended_at for a pending session that somehow never had ended_at set", async () => {
    pendingLimitMock.mockResolvedValue({
      data: [
        {
          id: "session-4",
          user_id: "user-4",
          level_before: "A1",
          correction_mode_used: "summary",
          ended_at: null,
        },
      ],
      error: null,
    });
    const now = new Date("2026-07-09T12:00:00.000Z");

    const result = await runSessionMaintenance({ supabase: mockSupabase(), getSummary, now });

    expect(result.pendingRetried).toBe(1);
  });
});
