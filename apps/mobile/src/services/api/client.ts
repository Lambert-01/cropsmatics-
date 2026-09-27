import Constants from "expo-constants";

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();
  if (fromConfig) return fromConfig;
  // Simulator/emulator default. A physical device must set
  // EXPO_PUBLIC_API_BASE_URL to the LAN address — localhost will not resolve.
  return "http://localhost:8000/api/v1";
}

export const BASE_URL = resolveBaseUrl();

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
