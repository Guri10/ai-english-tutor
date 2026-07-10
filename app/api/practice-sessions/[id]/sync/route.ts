import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserClaims } from "@/lib/auth/get-user-claims";

// Heartbeat: called (a) after each completed turn, as a fire-and-forget
// fetch, and (b) from beforeunload/visibilitychange via navigator.sendBeacon
// (issue #6) — same-origin, so the Supabase auth cookie rides along with no
// custom headers needed, which is all sendBeacon supports anyway. This is
// what gives the server-side abandoned-session sweep an up-to-date
// transcript to finalize with, not just whatever existed at connect time.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const supabase = await createClient();
  const claims = await getUserClaims(supabase);
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claims.sub as string;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.transcript)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const [transcriptResult, activityResult] = await Promise.all([
    supabase
      .from("session_transcripts")
      .upsert(
        { session_id: sessionId, raw_transcript: body.transcript },
        { onConflict: "session_id" }
      ),
    // Scoped to the caller's own still-active session — RLS already denies
    // cross-user writes, and `status = 'active'` stops a stray/late
    // heartbeat from reviving a session the sweep or endPracticeSession
    // already finalized.
    supabase
      .from("sessions")
      .update({ last_activity_at: now })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  if (transcriptResult.error || activityResult.error) {
    console.error(
      "practice-session sync: write failed",
      transcriptResult.error,
      activityResult.error
    );
    return NextResponse.json({ error: "failed to sync" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
