import type { SessionSummary } from "./session-summary-schema";

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Spec §4: "retried with backoff; if it still fails, the session is marked
// pending_summary". Covers transient failures (rate limits, timeouts)
// in-process, within the same request — the maintenance route's
// pending_summary pass (issue #6) is the backstop for whatever's still
// failing after this exhausts its attempts.
export async function summarizeSessionWithRetry(
  summarize: () => Promise<SessionSummary>,
  options: RetryOptions = {}
): Promise<SessionSummary | null> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await summarize();
    } catch (error) {
      console.error(
        `summarizeSessionWithRetry: attempt ${attempt}/${maxAttempts} failed`,
        error
      );
      if (attempt === maxAttempts) return null;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  return null;
}
