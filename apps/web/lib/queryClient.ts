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

export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_RETRY_LIMIT) return false;
  if (error instanceof ApiFailure) {
    if (error.retryable === false) return false;
    // A refusal is deterministic; a 5xx or an unreachable host may clear.
    return error.status === null || error.status >= 500;
  }
  return true;
}

export function retryDelay(attempt: number): number {
  // 500ms, 1s, ... capped. Explicit backoff rather than an immediate second call.
  return Math.min(500 * 2 ** attempt, 4_000);
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
