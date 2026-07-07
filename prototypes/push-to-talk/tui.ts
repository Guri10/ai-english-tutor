// PROTOTYPE — throwaway terminal shell. Delete this file (and machine.ts,
// once its answer is captured in NOTES.md) after the question is answered.
// Run: npm run prototype:push-to-talk

import { reduce, initialState, recap, type SessionState, type CorrectionMode } from "./machine";

let state: SessionState = initialState("inline");

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";

function render() {
  process.stdout.write("\x1b[2J\x1b[H"); // clear + home

  console.log(`${BOLD}push-to-talk prototype${RESET} ${DIM}(session state machine)${RESET}\n`);

  console.log(`${BOLD}phase:${RESET}            ${GREEN}${state.phase}${RESET}`);
  console.log(`${BOLD}correctionMode:${RESET}   ${state.correctionMode}${state.turn > 0 ? DIM + "  (locked — turn > 0)" + RESET : ""}`);
  console.log(`${BOLD}turn:${RESET}             ${state.turn}`);
  console.log(`${BOLD}connectionDropped:${RESET} ${state.connectionDroppedDuring ?? DIM + "none" + RESET}`);
  if (state.lastError) console.log(`${RED}${BOLD}lastError:${RESET} ${RED}${state.lastError}${RESET}`);

  console.log(`\n${BOLD}transcript${RESET} ${DIM}(last 6)${RESET}`);
  const recent = state.transcript.slice(-6);
  if (recent.length === 0) console.log(`  ${DIM}(empty)${RESET}`);
  for (const e of recent) {
    const tag = e.isCorrection ? `${RED}[correction]${RESET} ` : "";
    console.log(`  ${DIM}#${e.turn}${RESET} ${e.speaker === "student" ? "student" : "tutor  "} ${tag}${e.text}`);
  }

  console.log(`\n${BOLD}pendingMistakes:${RESET} ${state.pendingMistakes.length}`);

  if (state.phase === "ended") {
    const r = recap(state);
    console.log(`\n${BOLD}recap:${RESET} showsCorrections=${r.showsCorrections} mistakes=${JSON.stringify(r.mistakes)}`);
  }

  console.log(`\n${DIM}────────────────────────────────────────${RESET}`);
  console.log(
    `${BOLD}c${RESET}${DIM} connect${RESET}  ${BOLD}y${RESET}${DIM} connected${RESET}  ${BOLD}n${RESET}${DIM} connect failed${RESET}  ` +
    `${BOLD}d${RESET}${DIM} mic down${RESET}  ${BOLD}u${RESET}${DIM} mic up${RESET}`
  );
  console.log(
    `${BOLD}s${RESET}${DIM} response start${RESET}  ${BOLD}t${RESET}${DIM} text chunk${RESET}  ${BOLD}m${RESET}${DIM} correction chunk${RESET}  ${BOLD}f${RESET}${DIM} response done${RESET}`
  );
  console.log(
    `${BOLD}x${RESET}${DIM} connection dropped${RESET}  ${BOLD}r${RESET}${DIM} reconnect${RESET}  ` +
    `${BOLD}i${RESET}${DIM} toggle correction mode${RESET}  ${BOLD}e${RESET}${DIM} end session${RESET}  ${BOLD}q${RESET}${DIM} quit${RESET}`
  );
}

function toggleMode(mode: CorrectionMode): CorrectionMode {
  return mode === "inline" ? "summary" : "inline";
}

render();

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

process.stdin.on("data", (key: string) => {
  if (key === "" || key === "q") {
    process.stdout.write("\x1b[2J\x1b[H");
    process.exit(0);
  }

  switch (key) {
    case "c":
      state = reduce(state, { type: "CONNECT" });
      break;
    case "y":
      state = reduce(state, { type: "CONNECTED" });
      break;
    case "n":
      state = reduce(state, { type: "CONNECT_FAILED", reason: "mic permission denied" });
      break;
    case "d":
      state = reduce(state, { type: "MIC_DOWN" });
      break;
    case "u":
      state = reduce(state, { type: "MIC_UP" });
      break;
    case "s":
      state = reduce(state, { type: "RESPONSE_START" });
      break;
    case "t":
      state = reduce(state, { type: "RESPONSE_TEXT_CHUNK", text: "great, tell me more. " });
      break;
    case "m":
      state = reduce(state, {
        type: "RESPONSE_TEXT_CHUNK",
        text: "quick note — it's 'I went', not 'I goed'. ",
        isCorrection: true,
      });
      break;
    case "f":
      state = reduce(state, { type: "RESPONSE_DONE" });
      break;
    case "x":
      state = reduce(state, { type: "CONNECTION_DROPPED" });
      break;
    case "r":
      state = reduce(state, { type: "RECONNECT" });
      break;
    case "i":
      state = reduce(state, { type: "SET_CORRECTION_MODE", mode: toggleMode(state.correctionMode) });
      break;
    case "e":
      state = reduce(state, { type: "END_SESSION" });
      break;
  }

  render();
});
