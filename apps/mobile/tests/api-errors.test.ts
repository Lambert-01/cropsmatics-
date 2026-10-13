import { describe, expect, it, vi } from "vitest";

/**
 * The production incident these tests pin: the deployed API answered
 * `503 DATASET_OUT_OF_SYNC` for every canonical-backed analytics read, and the
 * mobile client turned it into `ServerError("The server could not complete the
 * request", 503)`. A screen then showed a generic failure with no way to tell a
 * degraded service from a genuine "no published data for this selection".
 */
import {
  ServerError,
  describeServerFailure,
  request,
} from "../src/services/api/client";
import {
  MOBILE_QUERY_DEFAULTS,
  MOBILE_RETRY_LIMIT,
  shouldRetryMobileRequest,
} from "../src/services/queryPolicy";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));

describe("describeServerFailure", () => {
  it("explains an out-of-sync canonical dataset as a temporary service state", () => {
    const { message, retryable } = describeServerFailure(503, {
      code: "DATASET_OUT_OF_SYNC",
      retryable: true,
    });

    expect(retryable).toBe(true);
    expect(message).toMatch(/withheld/i);
    expect(message).toMatch(/dataset/i);
    // Never an empty-result claim: 0 published and 0 served are different facts.
    expect(message).not.toMatch(/\b0\b/);
    expect(message.toLowerCase()).not.toContain("no data");
  });

  it("distinguishes an unavailable database from an out-of-sync dataset", () => {
    const { message } = describeServerFailure(503, { code: "DATABASE_UNAVAILABLE" });
    expect(message).toMatch(/database/i);
    expect(message).toMatch(/unavailable/i);
  });

  it("still says something useful for a bare 503", () => {
    const { message, retryable } = describeServerFailure(503, null);
    expect(retryable).toBe(true);
    expect(message).toMatch(/temporarily unavailable/i);
  });

  it("uses the server's own wording for a non-5xx refusal", () => {
    const { message, retryable } = describeServerFailure(422, {
      detail: "district trends require a crop",
    });
    expect(message).toBe("district trends require a crop");
    expect(retryable).toBe(false);
  });
});

describe("request()", () => {
  const respondWith = (status: number, body: unknown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        clone: () => ({ json: async () => body }),
        json: async () => body,
      })),
    );
  };

  it("surfaces the API's code and message for a typed 503", async () => {
    respondWith(503, {
      code: "DATASET_OUT_OF_SYNC",
      message: "expected version 'a', loaded 'b'",
      retryable: true,
    });

    await expect(request("/analytics/input-adoption")).rejects.toMatchObject({
      name: "ApiError",
      kind: "server",
      status: 503,
      code: "DATASET_OUT_OF_SYNC",
      retryable: true,
    });

    vi.unstubAllGlobals();
  });

  it("keeps the failure informational when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        clone: () => ({
          json: async () => {
            throw new Error("not json");
          },
        }),
      })),
    );

    const error = (await request("/crops").catch((e) => e)) as ServerError;
    expect(error).toBeInstanceOf(ServerError);
    expect(error.status).toBe(502);
    expect(error.message).toMatch(/service problem/i);

    vi.unstubAllGlobals();
  });
});

describe("mobile retry policy", () => {
  it("retries a 5xx once, then stops", () => {
    const failure = new ServerError("unavailable", 503, "DATASET_OUT_OF_SYNC", true);
    expect(shouldRetryMobileRequest(0, failure)).toBe(true);
    expect(shouldRetryMobileRequest(MOBILE_RETRY_LIMIT, failure)).toBe(false);
  });

  it("never retries a deterministic refusal", () => {
    const refusal = new ServerError("bad filter", 422, null, false);
    expect(shouldRetryMobileRequest(0, refusal)).toBe(false);
  });

  it("backs off rather than firing immediately", () => {
    expect(MOBILE_QUERY_DEFAULTS.queries.retryDelay(0)).toBeGreaterThan(0);
    expect(MOBILE_QUERY_DEFAULTS.queries.retryDelay(1)).toBeGreaterThan(
      MOBILE_QUERY_DEFAULTS.queries.retryDelay(0),
    );
  });
});
