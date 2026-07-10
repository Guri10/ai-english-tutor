import { describe, expect, it } from "vitest";
import { buildSessionStartRow } from "./shape-session-start";

describe("buildSessionStartRow", () => {
  it("builds an active sessions insert row scoped to the user", () => {
    const row = buildSessionStartRow("user-1", {
      correctionMode: "inline",
      levelBefore: "B1",
    });

    expect(row).toEqual({
      user_id: "user-1",
      correction_mode_used: "inline",
      level_before: "B1",
      status: "active",
    });
  });

  it("carries summary mode through unchanged", () => {
    const row = buildSessionStartRow("user-2", {
      correctionMode: "summary",
      levelBefore: "A1",
    });

    expect(row.correction_mode_used).toBe("summary");
  });
});
