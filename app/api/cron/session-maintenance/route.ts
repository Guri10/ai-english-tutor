import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createOpenAIClient } from "@/lib/openai/server-client";
import { getSessionSummary } from "@/lib/summarization/get-session-summary";
import { runSessionMaintenance } from "@/lib/realtime/run-session-maintenance";

// Triggered on a schedule by Supabase pg_cron + pg_net (not Vercel Cron —
// this project is on Vercel's Hobby plan, which only allows daily-granularity
// crons, too coarse for spec §4's 15-minute abandoned-session sweep). The
// scheduled pg_net call sends this shared secret as a bearer token so the
// route can't be triggered by an arbitrary request.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const openai = createOpenAIClient();

  const result = await runSessionMaintenance({
    supabase,
    getSummary: (transcript, levelBefore) =>
      getSessionSummary(openai, transcript, levelBefore),
  });

  return NextResponse.json(result);
}
