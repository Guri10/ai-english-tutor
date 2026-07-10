import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionMode } from "./session-machine";
import { buildSessionStartRow } from "./shape-session-start";

export type ResolveActiveSessionInput = {
  supabase: SupabaseClient;
  userId: string;
  correctionMode: CorrectionMode;
  levelBefore: string;
  // Present on a reconnect (WebSocket drop mid-session) — the client's
  // already-established sessionId, to continue rather than start a second
  // 'active' row for the same conversation.
  existingSessionId?: string;
};

export type ResolveActiveSessionResult =
  | { ok: true; sessionId: string }
  | { ok: false };

// A reconnect reuses the existing row (and counts as activity, bumping
// last_activity_at) whenever it still resolves to the caller's own active
// session. If it doesn't — e.g. the maintenance sweep already finalized it
// while the client was mid-reconnect — falling back to starting a new one
// is safe: the old row is already in a terminal state, so there's no
// double-counting, just a fresh session going forward.
export async function resolveActiveSession(
  input: ResolveActiveSessionInput
): Promise<ResolveActiveSessionResult> {
  const { supabase, userId, correctionMode, levelBefore, existingSessionId } = input;

  if (existingSessionId) {
    const { data, error } = await supabase
      .from("sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", existingSessionId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (!error && data) {
      return { ok: true, sessionId: data.id };
    }
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert(buildSessionStartRow(userId, { correctionMode, levelBefore }))
    .select("id")
    .single();
  if (error || !data) {
    console.error("resolveActiveSession: failed to create session row", error);
    return { ok: false };
  }
  return { ok: true, sessionId: data.id };
}
