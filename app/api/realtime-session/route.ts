import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserClaims } from "@/lib/auth/get-user-claims";
import { fetchSessionContext } from "@/lib/realtime/fetch-session-context";
import { buildSystemPrompt } from "@/lib/realtime/build-system-prompt";
import { createOpenAIClient } from "@/lib/openai/server-client";

const REALTIME_MODEL = "gpt-realtime";
const INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const VOICE = "marin";

export async function POST() {
  const supabase = await createClient();
  const claims = await getUserClaims(supabase);
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claims.sub as string;

  const context = await fetchSessionContext(supabase, userId);
  const instructions = buildSystemPrompt(context);

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
    correctionMode: context.correctionMode,
  });
}
