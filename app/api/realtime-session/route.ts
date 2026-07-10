import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserClaims } from "@/lib/auth/get-user-claims";
import { fetchSessionContext } from "@/lib/realtime/fetch-session-context";
import { buildSystemPrompt } from "@/lib/realtime/build-system-prompt";
import { resolveActiveSession } from "@/lib/realtime/resolve-active-session";
import { createOpenAIClient } from "@/lib/openai/server-client";
import { FLAG_CORRECTION_TOOL_NAME, isCorrectionMode } from "@/lib/realtime/session-machine";
import { getDailySessionCap, isDailySessionCapExceeded, utcDayStartIso } from "@/lib/realtime/check-daily-session-cap";
import { logQueryErrors } from "@/lib/supabase/log-query-errors";

const REALTIME_MODEL = "gpt-realtime";
const INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const VOICE = "marin";

// Called silently by the model alongside a spoken inline correction — the
// client tags the corresponding transcript entry from this, and the recap
// (issue #4/#5) uses that to skip re-showing mistakes already delivered
// live. No arguments are read server-side; the schema exists so the model
// has to identify a real correction to invoke it at all.
const FLAG_CORRECTION_TOOL = {
  type: "function" as const,
  name: FLAG_CORRECTION_TOOL_NAME,
  description:
    "Call this silently, alongside your spoken correction, every time you correct a student mistake in-voice. Do not mention this tool to the student.",
  parameters: {
    type: "object",
    properties: {
      mistakeType: { type: "string", description: "Short label, e.g. 'past_tense', 'article_usage'." },
      studentText: { type: "string", description: "What the student said." },
      correction: { type: "string", description: "The corrected form." },
    },
    required: ["mistakeType", "studentText", "correction"],
  },
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const claims = await getUserClaims(supabase);
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claims.sub as string;

  const body = await request.json().catch(() => null);
  const override = body && isCorrectionMode(body.correctionMode) ? body.correctionMode : undefined;
  const existingSessionId =
    body && typeof body.sessionId === "string" ? body.sessionId : undefined;

  // Spec §4 cost guardrail: block starting a *new* session once the caller
  // has already started `cap` sessions today (any status — bounds spend
  // from a stuck client or accidental loop, not just completed sessions).
  // Skipped for a reconnect (existingSessionId set) — that's the same
  // conversation continuing after a dropped WebSocket, not a new session,
  // and it shouldn't get cut off by a cap that's already counting it via
  // the row resolveActiveSession will reuse below.
  if (!existingSessionId) {
    const cap = getDailySessionCap();
    const sessionsTodayResult = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("started_at", utcDayStartIso());
    logQueryErrors("realtime-session: counting today's sessions", [sessionsTodayResult]);
    if (isDailySessionCapExceeded(sessionsTodayResult.count ?? 0, cap)) {
      return NextResponse.json(
        { error: `Daily session limit reached (${cap}/day). Try again tomorrow.` },
        { status: 429 }
      );
    }
  }

  const context = await fetchSessionContext(supabase, userId);
  const correctionMode = override ?? context.correctionMode;
  const instructions = buildSystemPrompt({ ...context, correctionMode });

  const openai = createOpenAIClient();
  let clientSecret;
  try {
    clientSecret = await openai.realtime.clientSecrets.create({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        audio: {
          input: {
            transcription: { model: INPUT_TRANSCRIPTION_MODEL },
            // Push-to-talk: the client explicitly commits audio and
            // requests a response (spec §3), so server-side VAD stays off.
            turn_detection: null,
          },
          output: { voice: VOICE },
        },
        output_modalities: ["audio"],
        tools: correctionMode === "inline" ? [FLAG_CORRECTION_TOOL] : undefined,
      },
    });
  } catch (error) {
    console.error("realtime-session: failed to mint client secret", error);
    return NextResponse.json(
      { error: "failed to start realtime session" },
      { status: 502 }
    );
  }

  // The session row is resolved only once minting actually succeeds — doing
  // this first and rolling back on failure would need a DELETE policy this
  // schema deliberately doesn't have (no delete feature exists yet), and
  // would otherwise leave an 'active' row for a session that never really
  // started for the sweep to eventually mis-count as a real (if silent)
  // completed session. A reconnect (existingSessionId set) reuses the same
  // row instead of starting a second one for the same conversation.
  const resolved = await resolveActiveSession({
    supabase,
    userId,
    correctionMode,
    levelBefore: context.levelScore,
    existingSessionId,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: "failed to start session" }, { status: 500 });
  }

  return NextResponse.json({
    value: clientSecret.value,
    expiresAt: clientSecret.expires_at,
    levelScore: context.levelScore,
    correctionMode,
    sessionId: resolved.sessionId,
  });
}
