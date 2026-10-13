import { ApiError } from "./api/client";

/**
 * Retry policy for every analytical query on the device.
 *
 * A phone on a weak link is the case a retry exists for; a *degraded backend* is
 * not, and the two must not be confused. When the API answers a typed 503
 * (`DATASET_OUT_OF_SYNC` / `DATABASE_UNAVAILABLE`) retrying immediately cannot
 * succeed, and each retry is another request against a service that is already
 * telling us it cannot answer. Deterministic refusals (404 unpublished
 * selection, 422 unsupported filter) are never retried either.
 */
export const MOBILE_RETRY_LIMIT = 1;

export function shouldRetryMobileRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= MOBILE_RETRY_LIMIT) return false;
  if (error instanceof ApiError) {
    if (error.retryable === false) return false;
    // An unreachable host or a 5xx may clear; a refusal will not.
    return error.status === null || error.status >= 500;
  }
  return true;
}

export function mobileRetryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 8_000);
}

export const MOBILE_QUERY_DEFAULTS = {
  queries: {
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: shouldRetryMobileRequest,
    retryDelay: mobileRetryDelay,
    refetchOnWindowFocus: false,
  },
} as const;
