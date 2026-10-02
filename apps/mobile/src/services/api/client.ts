import Constants from "expo-constants";

/** The deployed API. Release builds use this when nothing overrides it. */
export const PRODUCTION_API_BASE_URL = "https://cropsmatics-api.onrender.com/api/v1";

/**
 * Local development service.
 *
 * Simulator/emulator only: a physical device must set
 * `EXPO_PUBLIC_API_BASE_URL` to the LAN address, because a loopback host does
 * not resolve from another machine.
 */
export const DEVELOPMENT_API_BASE_URL = "http://localhost:8000/api/v1";

/** React Native defines `__DEV__`; plain node (unit tests) does not. */
const IS_DEV = typeof __DEV__ === "undefined" ? process.env.NODE_ENV !== "production" : __DEV__;

/**
 * A host that only resolves on the machine running the API.
 *
 * The boundary after the host matters: `localhost.example.org` is a different
 * host that merely starts with the same label, and must not be treated as
 * loopback.
 */
export function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2|\[::1\])(:|\/|$)/i.test(
    url.trim(),
  );
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface ApiConfig {
  baseUrl: string;
  /** Null when the configuration is sound; otherwise why it is not. */
  problem: string | null;
}

export interface ApiConfigInputs {
  /** `EXPO_PUBLIC_API_BASE_URL`, inlined at build time. */
  envBaseUrl?: string | null;
  /** `app.json` -> `expo.extra.apiBaseUrl`. */
  configBaseUrl?: string | null;
  /** False in a release build. */
  isDev: boolean;
}

/**
 * Resolve the API base URL for a build. Pure, so every combination is testable.
 *
 * Precedence:
 *   1. `EXPO_PUBLIC_API_BASE_URL` (build-time env, e.g. an EAS profile's `env`)
 *   2. `app.json` -> `expo.extra.apiBaseUrl`
 *   3. a development or production default, chosen by build type
 *
 * The previous version ended with a bare `http://localhost:8000/api/v1`
 * fallback, so a release build with no override shipped pointing at loopback and
 * could reach nothing. A release build now defaults to the deployed API, and an
 * explicitly configured loopback host in a release build is reported rather than
 * failing silently.
 */
export function resolveApiConfig(inputs: ApiConfigInputs): ApiConfig {
  const explicit = inputs.envBaseUrl?.trim() || inputs.configBaseUrl?.trim() || "";

  if (explicit) {
    const baseUrl = stripTrailingSlash(explicit);
    return {
      baseUrl,
      problem:
        !inputs.isDev && isLoopbackUrl(baseUrl)
          ? `This release build points at the loopback API (${baseUrl}), which no installed device can reach. Set EXPO_PUBLIC_API_BASE_URL to a public or LAN host.`
          : null,
    };
  }

  return {
    baseUrl: inputs.isDev ? DEVELOPMENT_API_BASE_URL : PRODUCTION_API_BASE_URL,
    problem: null,
  };
}

export const API_CONFIG = resolveApiConfig({
  envBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  configBaseUrl: Constants.expoConfig?.extra?.apiBaseUrl as string | undefined,
  isDev: IS_DEV,
});

export const BASE_URL = API_CONFIG.baseUrl;

if (API_CONFIG.problem) {
  // Loud on purpose: a misconfigured release build is a shipping blocker, and
  // the share screen surfaces the same value to whoever distributes the APK.
  console.error(`[cropmatics] API configuration: ${API_CONFIG.problem}`);
}

/** Typed API error model. The UI branches on these, never on status text. */
export class ApiError extends Error {
  readonly kind:
    | "network"
    | "timeout"
    | "not_found"
    | "validation"
    | "unsupported"
    | "server"
    | "unknown";
  readonly status: number | null;

  constructor(kind: ApiError["kind"], message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export class NetworkError extends ApiError {
  constructor(message = "Network request failed") {
    super("network", message, null);
  }
}

export class TimeoutError extends ApiError {
  constructor(message = "Request timed out") {
    super("timeout", message, null);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super("not_found", message, 404);
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Invalid request") {
    super("validation", message, 422);
  }
}

/** The data genuinely does not exist for this selection (not an error state). */
export class UnsupportedDataError extends ApiError {
  constructor(message = "No verified data for this selection") {
    super("unsupported", message, 404);
  }
}

export class ServerError extends ApiError {
  constructor(message = "The server could not complete the request", status = 500) {
    super("server", message, status);
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      ...init,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new TimeoutError();
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 404) throw new NotFoundError();
    if (res.status === 422) throw new ValidationError();
    if (res.status >= 500) throw new ServerError(undefined, res.status);
    throw new ApiError("unknown", `Request failed (${res.status})`, res.status);
  }

  return (await res.json()) as T;
}

/** Build a query string from defined, non-empty params only. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
