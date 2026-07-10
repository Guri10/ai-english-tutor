import type { CorrectionMode } from "./session-machine";

export type SessionStartInput = {
  correctionMode: CorrectionMode;
  levelBefore: string;
};

export type SessionStartInsertRow = {
  user_id: string;
  correction_mode_used: CorrectionMode;
  level_before: string;
  status: "active";
};

// The `sessions` row is now created at connect time (issue #6), not at
// session end — a server-side abandoned-session sweep needs a row to find.
// started_at/last_activity_at are left for the DB's own `default now()`
// rather than stamped from app code, avoiding client/server clock skew.
export function buildSessionStartRow(
  userId: string,
  input: SessionStartInput
): SessionStartInsertRow {
  return {
    user_id: userId,
    correction_mode_used: input.correctionMode,
    level_before: input.levelBefore,
    status: "active",
  };
}
