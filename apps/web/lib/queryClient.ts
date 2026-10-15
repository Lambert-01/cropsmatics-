import { ApiFailure } from "@/lib/apiError";

/**
 * Query policy for the analytical screens, kept in one place so it is testable.
 *
 * Two properties matter during a backend incident:
 *
 * * **Bounded retries.** A 503 from the canonical layer is a *state*, not a blip:
 *   retrying it hard multiplies the load on an already-degraded service and fills
 *   the logs with the same error. One retry, with a short backoff, is enough for
 *   a transient failure and stops a page of panels from hammering the API.
 * * **No point retrying a refusal.** 4xx answers (`404` unpublished selection,
 *   `422` unsupported filter) will not change on their own, so they are not
 *   retried at all - the panel explains them instead.
 */
export const QUERY_RETRY_LIMIT = 1;

/**
 * Spread retries in time.
 *
 * Every panel on a dashboard fails together when the API is down. With a fixed
 * delay they also *retry together*, which turns one outage into a synchronised
 * thundering herd against a service that is already struggling. Jitter breaks
 * the alignment; the bound keeps a retry close enough to feel immediate.
 */
export const RETRY_JITTER_RATIO = 0.4;
export const RETRY_BASE_DELAY_MS = 600;
export const RETRY_MAX_DELAY_MS = 4_000;

/**
 * A bounded jitter offset for one attempt, in
 * `[-RETRY_JITTER_RATIO, +RETRY_JITTER_RATIO]`.
 *
 * Derived from the wall clock plus the attempt number so two panels that fail in
 * the same tick still diverge on the next. Exposed as the `jitter` parameter of
 * {@link retryDelay} so a test can assert the bounds without stubbing a clock.
 */
export function retryJitter(attempt: number, now = Date.now()): number {
  const phase = (now + attempt * 977) % 1000;
  return ((phase / 1000) * 2 - 1) * RETRY_JITTER_RATIO;
}

/**
 * Delay before attempt `attempt` (0-based): bounded exponential, plus jitter.
 *
 * The jitter is an explicit parameter so this stays a pure function to test; the
 * exponential bound is what callers can assert on, because two jittered delays
 * of different attempts are not guaranteed to be ordered (a 40% offset on a
 * doubling base is larger than one step).
 */
export function retryDelayWithJitter(attempt: number, jitter: number): number {
  const base = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  return Math.round(base * (1 + jitter));
}

/**
 * The `retryDelay` React Query calls.
 *
 * Signature matches `RetryDelayFunction` (`(attemptIndex, error) => number`) so
 * it can be assigned to `defaultOptions.queries.retryDelay` directly.
 */
export function retryDelay(attemptIndex: number, _error?: unknown): number {
  return retryDelayWithJitter(attemptIndex, retryJitter(attemptIndex));
}

export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_RETRY_LIMIT) return false;
  if (error instanceof ApiFailure) {
    // A policy refusal (422 unsupported selection, 404 unpublished dataset, an
    // invalid `NEXT_PUBLIC_API_BASE_URL`) is deterministic: retrying it only
    // delays the message the reader needs.
    if (error.retryable === false) return false;
    // A refusal is deterministic; a 5xx or an unreachable host may clear.
    return error.status === null || error.status >= 500;
  }
  return true;
}

export const QUERY_DEFAULTS = {
  queries: {
    staleTime: 60_000,
    retry: shouldRetryRequest,
    retryDelay,
    // Do not refetch every mounted panel when the tab regains focus: on a
    // degraded backend that turns one visit into a burst of failing requests.
    refetchOnWindowFocus: false,
  },
} as const;
