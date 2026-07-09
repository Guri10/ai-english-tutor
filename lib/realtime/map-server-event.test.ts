import { describe, expect, it } from "vitest";
import { mapServerEventToAction, type ServerEventContext } from "./map-server-event";

function context(overrides: Partial<ServerEventContext> = {}): ServerEventContext {
  return { itemTurnMap: new Map(), currentTurn: 1, ...overrides };
}

describe("mapServerEventToAction", () => {
  it("maps session.created to CONNECTED", () => {
    expect(mapServerEventToAction({ type: "session.created" }, context())).toEqual({
      type: "CONNECTED",
    });
  });

  it("maps response.created to RESPONSE_START", () => {
    expect(mapServerEventToAction({ type: "response.created" }, context())).toEqual({
      type: "RESPONSE_START",
    });
  });

  it("maps response.output_audio_transcript.delta to RESPONSE_TEXT_CHUNK", () => {
    expect(
      mapServerEventToAction(
        { type: "response.output_audio_transcript.delta", delta: "Hi " },
        context()
      )
    ).toEqual({ type: "RESPONSE_TEXT_CHUNK", text: "Hi " });
  });

  it("maps response.done to RESPONSE_DONE", () => {
    expect(mapServerEventToAction({ type: "response.done" }, context())).toEqual({
      type: "RESPONSE_DONE",
    });
  });

  it("records the item id -> turn mapping on input_audio_buffer.committed and returns no action", () => {
    const ctx = context({ currentTurn: 3 });
    const action = mapServerEventToAction(
      { type: "input_audio_buffer.committed", item_id: "item-1" },
      ctx
    );
    expect(action).toBeNull();
    expect(ctx.itemTurnMap.get("item-1")).toBe(3);
  });

  it("maps a transcription-completed event to STUDENT_TRANSCRIPT using the recorded turn", () => {
    const ctx = context();
    ctx.itemTurnMap.set("item-1", 3);

    const action = mapServerEventToAction(
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item-1",
        transcript: "I goed to school",
      },
      ctx
    );

    expect(action).toEqual({ type: "STUDENT_TRANSCRIPT", turn: 3, text: "I goed to school" });
  });

  it("consumes the item id mapping so a duplicate completed event is ignored", () => {
    const ctx = context();
    ctx.itemTurnMap.set("item-1", 3);
    mapServerEventToAction(
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item-1",
        transcript: "first",
      },
      ctx
    );

    const action = mapServerEventToAction(
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item-1",
        transcript: "duplicate",
      },
      ctx
    );

    expect(action).toBeNull();
  });

  it("ignores a transcription-completed event for an unknown item id", () => {
    const action = mapServerEventToAction(
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "unknown-item",
        transcript: "orphaned",
      },
      context()
    );
    expect(action).toBeNull();
  });

  it("maps a flag_correction function-call-done event to CORRECTION_FLAGGED", () => {
    const action = mapServerEventToAction(
      {
        type: "response.function_call_arguments.done",
        name: "flag_correction",
        call_id: "call-1",
        arguments: '{"mistakeType":"past_tense"}',
      },
      context()
    );
    expect(action).toEqual({ type: "CORRECTION_FLAGGED" });
  });

  it("ignores a function-call-done event for a different tool", () => {
    const action = mapServerEventToAction(
      {
        type: "response.function_call_arguments.done",
        name: "some_other_tool",
        call_id: "call-1",
        arguments: "{}",
      },
      context()
    );
    expect(action).toBeNull();
  });

  it("returns null for unrecognized event types", () => {
    expect(mapServerEventToAction({ type: "some.other.event" }, context())).toBeNull();
  });
});
