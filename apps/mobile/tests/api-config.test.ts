import { describe, expect, it, vi } from "vitest";

/**
 * API base-URL resolution.
 *
 * The defect these guard: the resolver ended with a bare
 * `http://localhost:8000/api/v1` fallback and `app.json` baked the same value
 * into `extra.apiBaseUrl`, so a release build shipped pointing at loopback and
 * could reach no API at all.
 */
import {
  API_CONFIG,
  DEVELOPMENT_API_BASE_URL,
  PRODUCTION_API_BASE_URL,
  isLoopbackUrl,
  resolveApiConfig,
} from "../src/services/api/client";

// Vitest hoists this above the imports, so the client sees the mocked module.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));

describe("development builds", () => {
  it("defaults to the local service so `npm start` works with no configuration", () => {
    const config = resolveApiConfig({ isDev: true });
    expect(config.baseUrl).toBe(DEVELOPMENT_API_BASE_URL);
    expect(config.problem).toBeNull();
  });

  it("honours the build-time environment variable over everything else", () => {
    const config = resolveApiConfig({
      isDev: true,
      envBaseUrl: "http://192.168.1.20:8000/api/v1",
      configBaseUrl: "http://api.test/api/v1",
    });
    expect(config.baseUrl).toBe("http://192.168.1.20:8000/api/v1");
  });

  it("falls back to app.json extra when no env var is set", () => {
    const config = resolveApiConfig({ isDev: true, configBaseUrl: "http://api.test/api/v1" });
    expect(config.baseUrl).toBe("http://api.test/api/v1");
  });

  it("does not flag a loopback host in development", () => {
    const config = resolveApiConfig({ isDev: true, envBaseUrl: "http://localhost:8000/api/v1" });
    expect(config.problem).toBeNull();
    expect(isLoopbackUrl(config.baseUrl)).toBe(true);
  });

  it("ignores blank overrides rather than resolving to an empty base URL", () => {
    const config = resolveApiConfig({ isDev: true, envBaseUrl: "   ", configBaseUrl: null });
    expect(config.baseUrl).toBe(DEVELOPMENT_API_BASE_URL);
  });
});

describe("release builds", () => {
  it("defaults to the deployed API, never to loopback", () => {
    const config = resolveApiConfig({ isDev: false });
    expect(config.baseUrl).toBe(PRODUCTION_API_BASE_URL);
    expect(config.baseUrl).toContain("https://");
    expect(isLoopbackUrl(config.baseUrl)).toBe(false);
    expect(config.problem).toBeNull();
  });

  it("reports a loopback override instead of failing silently", () => {
    const config = resolveApiConfig({ isDev: false, envBaseUrl: "http://localhost:8000/api/v1" });
    expect(config.problem).toBeTruthy();
    expect(config.problem).toContain("loopback");
  });

  it("reports a loopback host inherited from app.json extra", () => {
    const config = resolveApiConfig({
      isDev: false,
      configBaseUrl: "http://127.0.0.1:8000/api/v1",
    });
    expect(config.problem).toBeTruthy();
  });

  it("accepts a real public override and trims the trailing slash", () => {
    const config = resolveApiConfig({
      isDev: false,
      envBaseUrl: "https://staging.example.org/api/v1/",
    });
    expect(config.baseUrl).toBe("https://staging.example.org/api/v1");
    expect(config.problem).toBeNull();
  });
});

describe("the config this build resolved", () => {
  it("exposes a usable base URL and the same one to the API client", () => {
    expect(API_CONFIG.baseUrl.length).toBeGreaterThan(0);
    expect(API_CONFIG.baseUrl.endsWith("/")).toBe(false);
  });
});

describe("loopback detection", () => {
  it("recognises every form a loopback host takes", () => {
    for (const url of [
      "http://localhost:8000/api/v1",
      "http://127.0.0.1:8000/api/v1",
      "http://10.0.2.2:8000/api/v1",
      "https://localhost/api/v1",
      "http://[::1]:8000/api/v1",
    ]) {
      expect(isLoopbackUrl(url), url).toBe(true);
    }
  });

  it("does not mistake a LAN or public host for loopback", () => {
    for (const url of [
      "http://192.168.1.20:8000/api/v1",
      "https://cropsmatics-api.onrender.com/api/v1",
      // A different host that merely starts with the same label.
      "https://localhost.example.org/api/v1",
    ]) {
      expect(isLoopbackUrl(url), url).toBe(false);
    }
  });
});
