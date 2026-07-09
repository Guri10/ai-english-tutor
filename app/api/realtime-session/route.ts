import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserClaims } from "@/lib/auth/get-user-claims";
import { fetchSessionContext } from "@/lib/realtime/fetch-session-context";
import { buildSystemPrompt } from "@/lib/realtime/build-system-prompt";
import { createOpenAIClient } from "@/lib/openai/server-client";
import { FLAG_CORRECTION_TOOL_NAME, isCorrectionMode } from "@/lib/realtime/session-machine";

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

  return NextResponse.json({
    value: clientSecret.value,
    expiresAt: clientSecret.expires_at,
    levelScore: context.levelScore,
    correctionMode,
  });
}
