import { describe, expect, it } from "vitest";

import {
  API_PATH_PREFIX,
  ApiConfigError,
  apiUrl,
  collapsePrefix,
  isLoopbackHost,
  resetApiBaseUrlCache,
  resolveApiBaseUrl,
} from "@/lib/apiUrl";
// The build-time guard in next.config.mjs re-states the same rules in plain JS
// (Next reads its config before TypeScript is compiled). These tests assert the
// two agree, so the runtime and build-time behaviour cannot drift apart.
import { ensureApiBaseUrl, normalizeApiPath } from "@/next.config.mjs";

const DEVELOPMENT = { production: false };
const PRODUCTION = { production: true };

describe("resolveApiBaseUrl — normalization", () => {
  it("keeps a well-formed base URL unchanged", () => {
    expect(resolveApiBaseUrl("https://api.example.com/api/v1", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("drops a trailing slash", () => {
    expect(resolveApiBaseUrl("https://api.example.com/api/v1/", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("collapses a duplicated path segment", () => {
    expect(resolveApiBaseUrl("https://api.example.com/api/v1/api/v1", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
    expect(resolveApiBaseUrl("https://api.example.com/api/v1/api/v1/api/v1", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("infers the API prefix from a bare origin", () => {
    expect(resolveApiBaseUrl("https://api.example.com", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("repairs a bare /api mount", () => {
    expect(resolveApiBaseUrl("https://api.example.com/api", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("preserves a custom mount that is not the API prefix", () => {
    expect(resolveApiBaseUrl("https://gateway.example.com/cropmatics/api/v1", PRODUCTION)).toBe(
      "https://gateway.example.com/cropmatics/api/v1",
    );
  });

  it("discards a query string or fragment from the base", () => {
    expect(resolveApiBaseUrl("https://api.example.com/api/v1?x=1#y", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
  });

  it("trims surrounding whitespace, as a pasted dashboard value has", () => {
    expect(resolveApiBaseUrl("  https://api.example.com/api/v1  ", PRODUCTION)).toBe(
      "https://api.example.com/api/v1",
    );
  });
});

describe("resolveApiBaseUrl — development", () => {
  it("falls back to localhost only outside a production bundle", () => {
    expect(resolveApiBaseUrl(undefined, DEVELOPMENT)).toBe(
      `http://localhost:8000${API_PATH_PREFIX}`,
    );
    expect(resolveApiBaseUrl("", DEVELOPMENT)).toBe(`http://localhost:8000${API_PATH_PREFIX}`);
  });

  it("preserves a LAN address so a physical phone can reach the API", () => {
    // A device on the same Wi-Fi cannot resolve `localhost`; the LAN URL is a
    // deliberate local configuration and must not be rewritten.
    expect(resolveApiBaseUrl("http://192.168.1.24:8000/api/v1", DEVELOPMENT)).toBe(
      "http://192.168.1.24:8000/api/v1",
    );
  });

  it("preserves the Android emulator loopback alias in development", () => {
    expect(resolveApiBaseUrl("http://10.0.2.2:8000/api/v1", DEVELOPMENT)).toBe(
      "http://10.0.2.2:8000/api/v1",
    );
  });
});

describe("resolveApiBaseUrl — refusal", () => {
  it("refuses an unset base URL in a production bundle", () => {
    expect(() => resolveApiBaseUrl(undefined, PRODUCTION)).toThrow(ApiConfigError);
    expect(() => resolveApiBaseUrl(undefined, PRODUCTION)).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
  });

  it("rejects local addresses in deployed browser bundles", () => {
    for (const host of ["localhost", "127.0.0.1", "0.0.0.0"]) {
      expect(() => resolveApiBaseUrl(`http://${host}:8000/api/v1`, PRODUCTION)).toThrow(ApiConfigError);
      expect(isLoopbackHost(host)).toBe(true);
    }
    expect(isLoopbackHost("api.example.com")).toBe(false);
  });

  it("refuses a value that is not an absolute URL", () => {
    expect(() => resolveApiBaseUrl("api.example.com/api/v1", PRODUCTION)).toThrow(ApiConfigError);
  });

  it("refuses a non-http scheme", () => {
    expect(() => resolveApiBaseUrl("ftp://api.example.com/api/v1", PRODUCTION)).toThrow(
      ApiConfigError,
    );
  });

  it("does not put a value in the error message that could be a credential", () => {
    // A base URL is public by construction, but the message must still be one
    // sentence a reader can act on and must name the variable to fix.
    try {
      resolveApiBaseUrl(undefined, PRODUCTION);
      expect.unreachable("expected a configuration error");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiConfigError);
      expect((error as ApiConfigError).variable).toBe("NEXT_PUBLIC_API_BASE_URL");
    }
  });
});

describe("collapsePrefix", () => {
  it("collapses only exact repeats of the prefix", () => {
    expect(collapsePrefix("/api/v1/api/v1/analytics")).toBe("/api/v1/analytics");
    expect(collapsePrefix("/gateway/api/v1/analytics")).toBe("/gateway/api/v1/analytics");
    expect(collapsePrefix("/analytics")).toBe("/analytics");
  });
});

describe("apiUrl", () => {
  it("never produces a doubled prefix, even from a doubled base", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.com/api/v1/api/v1";
    resetApiBaseUrlCache();
    expect(apiUrl("/analytics/canonical-trend", "crop=Maize")).toBe(
      "https://api.example.com/api/v1/analytics/canonical-trend?crop=Maize",
    );
    expect(apiUrl("reports/catalog")).toBe("https://api.example.com/api/v1/reports/catalog");
    expect(apiUrl("/api/v1/health")).toBe("https://api.example.com/api/v1/health");
  });

  it("surfaces a configuration error instead of calling the wrong host", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    resetApiBaseUrlCache();
    // NODE_ENV is "test" under vitest, so the development default applies and
    // the call succeeds against it — the refusal path is covered above with an
    // explicit `production: true`.
    expect(apiUrl("/health/readiness")).toBe("http://localhost:8000/api/v1/health/readiness");
  });
});

describe("build guard parity with the runtime resolver", () => {
  const cases: {
    label: string;
    raw: string | undefined;
    production: boolean;
    expectThrow: boolean;
  }[] = [
    { label: "well-formed", raw: "https://api.example.com/api/v1", production: true, expectThrow: false },
    { label: "trailing slash", raw: "https://api.example.com/api/v1/", production: true, expectThrow: false },
    {
      label: "doubled prefix",
      raw: "https://api.example.com/api/v1/api/v1",
      production: true,
      expectThrow: false,
    },
    { label: "bare origin", raw: "https://api.example.com", production: true, expectThrow: false },
    {
      label: "unset (production)",
      raw: undefined,
      production: true,
      expectThrow: true,
    },
    { label: "unset (development)", raw: undefined, production: false, expectThrow: false },
    { label: "loopback (production)", raw: "http://localhost:8000/api/v1", production: true, expectThrow: true },
    { label: "loopback (development)", raw: "http://localhost:8000/api/v1", production: false, expectThrow: false },
    { label: "LAN (development)", raw: "http://192.168.1.24:8000/api/v1", production: false, expectThrow: false },
    { label: "not a URL", raw: "api.example.com", production: true, expectThrow: true },
    { label: "bad scheme", raw: "ftp://api.example.com/api/v1", production: true, expectThrow: true },
  ];

  it.each(cases)("$label", ({ raw, production, expectThrow }) => {
    const runResolver = () => resolveApiBaseUrl(raw, { production });
    const runGuard = () => ensureApiBaseUrl(raw, { production });

    if (expectThrow) {
      expect(runResolver).toThrow();
      expect(runGuard).toThrow();
      return;
    }
    expect(runResolver()).toBe(runGuard().baseUrl);
  });

  it("normalizes the path identically", () => {
    for (const path of ["/api/v1", "/api/v1/", "/api/v1/api/v1", "/api", "", "/gateway/api/v1"]) {
      const viaResolver = resolveApiBaseUrl(`https://api.example.com${path}`, PRODUCTION);
      const viaGuard = ensureApiBaseUrl(`https://api.example.com${path}`, PRODUCTION).baseUrl;
      expect(viaResolver).toBe(viaGuard);
    }
  });

  it("rejects missing production configuration before publication", () => {
    expect(() => ensureApiBaseUrl(undefined, PRODUCTION)).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
    expect(ensureApiBaseUrl(undefined, DEVELOPMENT).unset).toBe(false);
    expect(normalizeApiPath("/api/v1/api/v1")).toBe("/api/v1");
  });

  it("supports an explicitly selected local-preview build", () => {
    const preview = { production: true, allowLocal: true };
    expect(ensureApiBaseUrl("http://127.0.0.1:8001/api/v1", preview).loopback).toBe(true);
    expect(resolveApiBaseUrl(undefined, preview)).toBe(ensureApiBaseUrl(undefined, preview).baseUrl);
    const lan = "http://192.168.1.24:8000/api/v1";
    expect(resolveApiBaseUrl(lan, preview)).toBe(ensureApiBaseUrl(lan, preview).baseUrl);
    expect(ensureApiBaseUrl("https://api.example.com/api/v1", PRODUCTION).loopback).toBe(false);
  });

  it.each(["https://127.0.0.2/api/v1", "https://192.168.1.24/api/v1", "http://api.example.com/api/v1"])(
    "rejects insecure or local deployment address %s", (value) => {
      expect(() => ensureApiBaseUrl(value, PRODUCTION)).toThrow();
      expect(() => resolveApiBaseUrl(value, PRODUCTION)).toThrow();
    },
  );
});
