"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  initialState,
  reduce,
  type CorrectionMode,
} from "@/lib/realtime/session-machine";
import { mapServerEventToAction } from "@/lib/realtime/map-server-event";
import { endPracticeSession, type EndPracticeSessionResult } from "./actions";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

type TokenResponse = {
  value: string;
  expiresAt: number;
  levelScore: string;
  correctionMode: CorrectionMode;
};

type SaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "error" }
  | { phase: "saved"; result: Extract<EndPracticeSessionResult, { ok: true }> };

type SessionMeta = {
  startedAt: string;
  levelBefore: string;
  correctionMode: CorrectionMode;
};

export function PracticeSession() {
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const itemTurnMapRef = useRef(new Map<string, number>());
  const sessionMetaRef = useRef<SessionMeta | null>(null);
  const isMountedRef = useRef(true);
  const [saveState, setSaveState] = useState<SaveState>({ phase: "idle" });

  const cleanupConnection = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupConnection();
    };
  }, [cleanupConnection]);

  const beginConnection = useCallback(async () => {
    cleanupConnection();
    // A stale in-flight attempt (superseded by a newer beginConnection call,
    // or the component unmounting) is detected by checking pc identity
    // against pcRef right before every side effect that would otherwise
    // touch shared state — cleanupConnection() above already invalidated
    // any previous attempt by nulling pcRef.
    let pc: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;
    try {
      const tokenResponse = await fetch("/api/realtime-session", {
        method: "POST",
      });
      if (!tokenResponse.ok) {
        throw new Error(`token endpoint returned ${tokenResponse.status}`);
      }
      const token: TokenResponse = await tokenResponse.json();

      const isFirstConnection = !sessionMetaRef.current;
      if (isFirstConnection) {
        sessionMetaRef.current = {
          startedAt: new Date().toISOString(),
          levelBefore: token.levelScore,
          correctionMode: token.correctionMode,
        };
      }

      pc = new RTCPeerConnection();
      const thisConnection = pc;

      const audioEl = new Audio();
      audioEl.autoplay = true;
      // Detached, unattached <audio> elements are unreliable for autoplay
      // across browsers (notably Safari, this app's primary target per the
      // design spec) — attach it (hidden) so playback actually starts.
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      pc.ontrack = (event) => {
        // ontrack can fire as soon as the remote SDP answer is applied —
        // i.e. before pcRef.current is published below — so staleness is
        // checked against the connection's own state (closed only happens
        // via cleanupConnection tearing down a superseded attempt), not
        // against pcRef.current, which would incorrectly treat this attempt
        // as stale before it's had a chance to publish itself.
        if (thisConnection.connectionState === "closed") return;
        audioEl.srcObject = event.streams[0];
        audioEl.play().catch((err) => {
          console.error("practice session: audio playback failed", err);
        });
      };

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== thisConnection) return; // superseded connection
        const dropped =
          thisConnection.connectionState === "failed" ||
          thisConnection.connectionState === "disconnected" ||
          thisConnection.connectionState === "closed";
        const phase = stateRef.current.phase;
        if (dropped && phase !== "idle" && phase !== "ended" && phase !== "error") {
          dispatch({ type: "CONNECTION_DROPPED" });
          cleanupConnection();
        }
      };

      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (pcRef.current !== null || !isMountedRef.current) {
        // Superseded by a newer attempt, or unmounted, while awaiting the
        // mic prompt — abandon locally without touching shared refs.
        pc.close();
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const [track] = localStream.getTracks();
      track.enabled = false; // push-to-talk: muted until MIC_DOWN
      pc.addTrack(track, localStream);

      const dc = pc.createDataChannel("oai-events");
      dc.addEventListener("message", (event) => {
        if (dcRef.current !== dc) return; // superseded connection
        let parsed: { type: string; [key: string]: unknown };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (parsed.type === "error") {
          console.error("realtime session: server error event", parsed);
          return;
        }
        const action = mapServerEventToAction(parsed, {
          itemTurnMap: itemTurnMapRef.current,
          currentTurn: stateRef.current.turn,
        });
        if (!action) return;
        dispatch(action);
        if (action.type === "CONNECTED" && isFirstConnection) {
          // Spec §3: the AI opens with a spoken greeting, unprompted, only
          // on the very first connection — a reconnect mid-session must not
          // re-trigger it (the reducer also independently rejects a stray
          // greeting past turn 0, as defense in depth).
          dc.send(JSON.stringify({ type: "response.create" }));
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`realtime calls endpoint returned ${sdpResponse.status}`);
      }
      const answerSdp = await sdpResponse.text();

      if (pcRef.current !== null || !isMountedRef.current) {
        pc.close();
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      if (!isMountedRef.current) {
        pc.close();
        localStream.getTracks().forEach((t) => t.stop());
        dc.close();
        return;
      }

      pcRef.current = pc;
      dcRef.current = dc;
      localStreamRef.current = localStream;
      audioElRef.current = audioEl;
      // CONNECTED is dispatched once the data channel delivers
      // session.created — see mapServerEventToAction.
    } catch (error) {
      pc?.close();
      localStream?.getTracks().forEach((t) => t.stop());
      if (pcRef.current !== null || !isMountedRef.current) return; // superseded — don't clobber a newer attempt
      console.error("practice session: connect failed", error);
      dispatch({ type: "CONNECT_FAILED", reason: "Could not start the session." });
    }
  }, [cleanupConnection]);

  const startSession = useCallback(() => {
    dispatch({ type: "CONNECT" });
    beginConnection();
  }, [beginConnection]);

  const reconnect = useCallback(() => {
    dispatch({ type: "RECONNECT" });
    beginConnection();
  }, [beginConnection]);

  const micDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (reduce(stateRef.current, { type: "MIC_DOWN" }).phase !== "recording") return;
    const track = localStreamRef.current?.getTracks()[0];
    if (!track) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    track.enabled = true;
    dispatch({ type: "MIC_DOWN" });
  }, []);

  const micUp = useCallback(() => {
    if (reduce(stateRef.current, { type: "MIC_UP" }).phase !== "committing") return;
    const track = localStreamRef.current?.getTracks()[0];
    if (track) track.enabled = false;
    dispatch({ type: "MIC_UP" });
    dcRef.current?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    dcRef.current?.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const endSession = useCallback(async () => {
    const transcript = stateRef.current.transcript;
    const meta = sessionMetaRef.current;

    dispatch({ type: "END_SESSION" });
    cleanupConnection();

    if (!meta) return; // never actually connected — nothing to save

    setSaveState({ phase: "saving" });
    const result = await endPracticeSession({
      transcript,
      startedAt: meta.startedAt,
      endedAt: new Date().toISOString(),
      levelBefore: meta.levelBefore,
      correctionMode: meta.correctionMode,
    });
    setSaveState(result.ok ? { phase: "saved", result } : { phase: "error" });
  }, [cleanupConnection]);

  const canEndSession = state.phase !== "idle" && state.phase !== "ended";

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      {state.phase === "idle" && (
        <button
          type="button"
          onClick={startSession}
          className="rounded-full border border-black/[.08] px-6 py-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Start practice
        </button>
      )}

      {state.phase === "connecting" && <p>Connecting…</p>}

      {state.phase === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-red-600 dark:text-red-400">{state.lastError}</p>
          <button
            type="button"
            onClick={reconnect}
            className="rounded-full border border-black/[.08] px-6 py-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Reconnect
          </button>
        </div>
      )}

      {["ready", "recording", "committing", "responding"].includes(state.phase) && (
        <button
          type="button"
          disabled={state.phase !== "ready" && state.phase !== "recording"}
          onPointerDown={micDown}
          onPointerUp={micUp}
          onPointerCancel={micUp}
          className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-black/[.15] text-sm font-medium transition-colors disabled:opacity-50 dark:border-white/[.2]"
          style={{
            backgroundColor: state.phase === "recording" ? "#ef4444" : undefined,
            color: state.phase === "recording" ? "white" : undefined,
          }}
        >
          {state.phase === "recording" ? "Recording…" : "Hold to talk"}
        </button>
      )}

      {state.transcript.length > 0 && (
        <ul className="flex w-full flex-col gap-2">
          {state.transcript.map((entry, index) => (
            <li
              key={index}
              className="rounded-lg border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.145]"
            >
              <span className="font-medium">
                {entry.speaker === "student" ? "You" : "Tutor"}:
              </span>{" "}
              {entry.text}
            </li>
          ))}
        </ul>
      )}

      {canEndSession && (
        <button
          type="button"
          onClick={endSession}
          className="rounded-full border border-black/[.08] px-6 py-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          End session
        </button>
      )}

      {state.phase === "ended" && (
        <div className="flex w-full flex-col items-center gap-4 text-center">
          {saveState.phase === "saving" && <p>Saving your session…</p>}
          {saveState.phase === "error" && (
            <p className="text-red-600 dark:text-red-400">
              Couldn&apos;t save your session — please try again later.
            </p>
          )}
          {saveState.phase === "saved" && <Recap result={saveState.result} />}
          <a href="/practice" className="underline">
            Start a new session
          </a>
        </div>
      )}
    </div>
  );
}

function Recap({
  result,
}: {
  result: Extract<EndPracticeSessionResult, { ok: true }>;
}) {
  if (result.status === "pending_summary") {
    return <p>Session saved — still processing your results…</p>;
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <p>
        Level: {result.levelBefore}
        {result.levelBefore !== result.levelAfter && ` → ${result.levelAfter}`}
      </p>
      <p>
        Streak: {result.streakCount} day{result.streakCount === 1 ? "" : "s"}
      </p>
      {result.mistakes.length > 0 ? (
        <ul className="flex w-full flex-col gap-2 text-left text-sm">
          {result.mistakes.map((mistake, index) => (
            <li
              key={index}
              className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
            >
              <p className="font-medium">{mistake.type}</p>
              <p>You said: &ldquo;{mistake.example}&rdquo;</p>
              <p>Correction: {mistake.correction}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No mistakes flagged this session — nice work!</p>
      )}
    </div>
  );
}
