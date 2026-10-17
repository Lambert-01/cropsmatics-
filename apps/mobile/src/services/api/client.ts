import Constants from "expo-constants";

import { clearSession, getSession, saveSession } from "../auth/session";

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
    | "unknown"
    | "auth";
  readonly status: number | null;
  /** The API's machine-readable code, when the server sent one. */
  readonly code: string | null;
  /** Whether the API itself said a retry can help. */
  readonly retryable: boolean | null;

  constructor(
    kind: ApiError["kind"],
    message: string,
    status: number | null = null,
    code: string | null = null,
    retryable: boolean | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

/** The API's error envelope (see `docs/P0_DATABASE_AUTHORITY.md`). */
export interface ApiFailureBody {
  code?: string | null;
  detail?: string | null;
  message?: string | null;
  retryable?: boolean | null;
}

/**
 * One honest sentence for a server-side failure, and whether retrying helps.
 *
 * The analytics API answers a *typed* 503 when the canonical database cannot
 * serve a read. Screens render the error's `message`, so a bare "Request failed
 * (503)" read as an empty result - or worse, invited a reader to take the
 * published figures as zero. Nothing here ever states a value.
 */
export function describeServerFailure(
  status: number,
  body: ApiFailureBody | null,
): { message: string; retryable: boolean } {
  const code = (body?.code ?? "").trim();

  if (status === 503) {
    if (code === "DATASET_OUT_OF_SYNC") {
      return {
        message:
          "The service is bringing its published dataset back in step with this release. Figures are withheld rather than shown from a mismatched build - try again shortly.",
        retryable: true,
      };
    }
    if (code === "DATABASE_UNAVAILABLE") {
      return {
        message:
          "The analytics database is temporarily unavailable, so these figures cannot be verified right now. Nothing is shown rather than an unverified value.",
        retryable: true,
      };
    }
    return {
      message:
        "The analytics service is temporarily unavailable. This is a service problem, not an empty result.",
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      message: `The analytics service failed to answer (HTTP ${status}). This is a service problem, not a verified empty result.`,
      retryable: true,
    };
  }

  return {
    message: body?.detail || body?.message || `Request failed (${status})`,
    retryable: body?.retryable ?? false,
  };
}

async function readFailureBody(res: Response): Promise<ApiFailureBody | null> {
  try {
    const body = (await res.clone().json()) as ApiFailureBody;
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
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
  constructor(
    message = "The server could not complete the request",
    status = 500,
    code: string | null = null,
    retryable: boolean | null = null,
  ) {
    super("server", message, status, code, retryable);
  }
}

export class AuthRequiredError extends ApiError {
  constructor(message = "Sign in to sync field records") {
    super("auth", message, 401, "AUTH_REQUIRED", false);
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

async function send(path: string, init: RequestInit | undefined, accessToken?: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new TimeoutError();
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
  return res;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSession();
  let res = await send(path, init, session?.access_token);

  // Refresh exactly once. Public analytical requests have no session and are
  // unchanged; operational requests recover from an expired access token
  // without exposing the refresh token outside SecureStore.
  if (res.status === 401 && session?.refresh_token && !path.endsWith("/auth/refresh")) {
    try {
      const refreshed = await send("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!refreshed.ok) throw new Error("refresh failed");
      const next = (await refreshed.json()) as {
        access_token: string;
        refresh_token: string;
        token_type: string;
      };
      await saveSession(next);
      res = await send(path, init, next.access_token);
    } catch {
      await clearSession();
      throw new AuthRequiredError();
    }
  }

  if (!res.ok) {
    if (res.status === 401) throw new AuthRequiredError();
    if (res.status === 404) throw new NotFoundError();
    if (res.status === 422) throw new ValidationError();
    if (res.status >= 500) {
      // The typed 503 is the reason the panel can say something true instead of
      // "Request failed (503)" - read it rather than discarding the body.
      const body = await readFailureBody(res);
      const described = describeServerFailure(res.status, body);
      throw new ServerError(described.message, res.status, body?.code ?? null, body?.retryable ?? described.retryable);
    }
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
