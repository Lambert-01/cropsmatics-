import { describe, expect, it } from "vitest";

import { ApiFailure, describeApiFailure } from "@/lib/apiError";
import {
  QUERY_DEFAULTS,
  QUERY_RETRY_LIMIT,
  retryDelay,
  shouldRetryRequest,
} from "@/lib/queryClient";

/**
 * The production incident these tests pin: every canonical-backed analytics
 * endpoint answered `503 DATASET_OUT_OF_SYNC` while the web client collapsed it
 * into "API /dashboard/overview failed: 503 Service Unavailable" and a hint to
 * run `make api`. A reader could not tell a service problem from an empty
 * result, and the panel offered them an action only a developer on the API host
 * could take.
 */
describe("describeApiFailure", () => {
  it("explains an out-of-sync canonical dataset as a temporary service state", () => {
    const { message, retryable } = describeApiFailure(503, {
      code: "DATASET_OUT_OF_SYNC",
      retryable: true,
    });

    expect(retryable).toBe(true);
    expect(message).toMatch(/dataset/i);
    expect(message).toMatch(/withheld/i);
    // It must not look like a published zero or an empty selection.
    expect(message).not.toMatch(/\b0\b/);
    expect(message.toLowerCase()).not.toContain("no data");
  });

  it("distinguishes an unavailable database from an out-of-sync one", () => {
    const { message } = describeApiFailure(503, { code: "DATABASE_UNAVAILABLE" });
    expect(message).toMatch(/database/i);
    expect(message).toMatch(/unavailable/i);
  });

  it("still says something useful for a bare 503", () => {
    const { message, retryable } = describeApiFailure(503, null, "Service Unavailable");
    expect(retryable).toBe(true);
    expect(message).toMatch(/temporarily unavailable/i);
    expect(message).toMatch(/service problem/i);
  });

  it("reports an unreachable service without inventing a value", () => {
    const { message, retryable } = describeApiFailure(null, null);
    expect(retryable).toBe(true);
    expect(message).toMatch(/could not be reached/i);
  });

  it("treats a 404 selection as a deterministic refusal, not a retry", () => {
    const { message, retryable } = describeApiFailure(404, { detail: "unknown crop: 'Kiwi'" });
    expect(retryable).toBe(false);
    expect(message).toBe("unknown crop: 'Kiwi'");
  });

  it("treats an unsupported filter as a deterministic refusal", () => {
    const { retryable } = describeApiFailure(422, null);
    expect(retryable).toBe(false);
  });

  it("carries the HTTP status on the thrown error for the retry policy", () => {
    const failure = new ApiFailure({
      path: "/analytics/input-adoption",
      status: 503,
      code: "DATASET_OUT_OF_SYNC",
      message: "withheld",
      retryable: true,
    });
    expect(failure).toBeInstanceOf(Error);
    expect(failure.status).toBe(503);
    expect(failure.code).toBe("DATASET_OUT_OF_SYNC");
    expect(failure.path).toBe("/analytics/input-adoption");
    expect(failure.retryable).toBe(true);
  });
});

describe("query retry policy", () => {
  const failure = (status: number | null, retryable: boolean | null = null) =>
    new ApiFailure({ path: "/x", status, message: "failed", retryable, code: null });

  it("retries a 5xx once and then stops", () => {
    expect(shouldRetryRequest(0, failure(503))).toBe(true);
    expect(shouldRetryRequest(QUERY_RETRY_LIMIT, failure(503))).toBe(false);
  });

  it("never retries a deterministic 4xx refusal", () => {
    expect(shouldRetryRequest(0, failure(404))).toBe(false);
    expect(shouldRetryRequest(0, failure(422))).toBe(false);
  });

  it("retries a network failure, where a retry can genuinely help", () => {
    expect(shouldRetryRequest(0, failure(null))).toBe(true);
  });

  it("honours the API's own retryable flag when it sends one", () => {
    expect(shouldRetryRequest(0, failure(503, false))).toBe(false);
  });

  it("backs off between attempts instead of firing immediately", () => {
    expect(retryDelay(0)).toBeGreaterThan(0);
    expect(retryDelay(1)).toBeGreaterThan(retryDelay(0));
    expect(retryDelay(10)).toBeLessThanOrEqual(4_000);
  });

  it("keeps the bounded retry policy on the shared query defaults", () => {
    expect(QUERY_DEFAULTS.queries.retry).toBe(shouldRetryRequest);
    expect(QUERY_DEFAULTS.queries.refetchOnWindowFocus).toBe(false);
  });
});
