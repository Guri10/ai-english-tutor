import { FLAG_CORRECTION_TOOL_NAME, type Action } from "./session-machine";

export type ServerEventContext = {
  // item_id -> turn, populated on input_audio_buffer.committed (which fires
  // synchronously on commit, before transcription starts) and consumed on
  // input_audio_transcription.completed (which arrives asynchronously and
  // can race a later turn's commit, so item_id — not "the current turn" — is
  // the only reliable correlation key).
  itemTurnMap: Map<string, number>;
  currentTurn: number;
};

type RealtimeServerEventLike = {
  type: string;
  [key: string]: unknown;
};

export function mapServerEventToAction(
  event: RealtimeServerEventLike,
  context: ServerEventContext
): Action | null {
  switch (event.type) {
    case "session.created":
      return { type: "CONNECTED" };

    case "response.created":
      return { type: "RESPONSE_START" };

    case "response.output_audio_transcript.delta":
      return { type: "RESPONSE_TEXT_CHUNK", text: String(event.delta ?? "") };

    case "response.done":
      return { type: "RESPONSE_DONE" };

    case "response.function_call_arguments.done":
      return event.name === FLAG_CORRECTION_TOOL_NAME ? { type: "CORRECTION_FLAGGED" } : null;

    case "input_audio_buffer.committed": {
      const itemId = event.item_id;
      if (typeof itemId === "string") {
        context.itemTurnMap.set(itemId, context.currentTurn);
      }
      return null;
    }

    case "conversation.item.input_audio_transcription.completed": {
      const itemId = event.item_id;
      if (typeof itemId !== "string") return null;
      const turn = context.itemTurnMap.get(itemId);
      if (turn === undefined) return null;
      context.itemTurnMap.delete(itemId);
      return { type: "STUDENT_TRANSCRIPT", turn, text: String(event.transcript ?? "") };
    }

    default:
      return null;
  }
}
