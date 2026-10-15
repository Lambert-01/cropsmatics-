/** Public browser URL rules; keep in step with the Next.js build guard. */
export const API_PATH_PREFIX = "/api/v1";

export class ApiConfigError extends Error {
  readonly variable: string;

  constructor(variable: string, message: string) {
    super(message);
    this.name = "ApiConfigError";
    this.variable = variable;
  }
}

const VARIABLE = "NEXT_PUBLIC_API_BASE_URL";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/** Local addresses require explicit local-preview mode in a production bundle. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

export interface ResolveApiBaseUrlOptions {
  production?: boolean;
  /** Set only by the explicit CROPMATICS_LOCAL_PREVIEW build option. */
  allowLocal?: boolean;
  developmentDefault?: string;
}

export function collapsePrefix(path: string): string {
  return path.replace(/(?:\/api\/v1)+/g, API_PATH_PREFIX);
}

export function resolveApiBaseUrl(
  raw: string | null | undefined,
  options: ResolveApiBaseUrlOptions = {},
): string {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const allowLocal = options.allowLocal ?? process.env.NEXT_PUBLIC_ALLOW_LOCAL_API === "1";
  const value = (raw ?? "").trim();
  if (!value && production && !allowLocal) {
    throw new ApiConfigError(
      VARIABLE,
      VARIABLE + " is required for production. Set the deployed HTTPS API base and rebuild.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value || options.developmentDefault || "http://localhost:8000/api/v1");
  } catch {
    throw new ApiConfigError(VARIABLE, VARIABLE + " must be a valid absolute http:// or https:// URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiConfigError(VARIABLE, VARIABLE + " must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new ApiConfigError(VARIABLE, VARIABLE + " is public and must not contain credentials.");
  }
  if (production && !allowLocal && (isLoopbackHost(parsed.hostname) || parsed.protocol !== "https:")) {
    throw new ApiConfigError(
      VARIABLE,
      VARIABLE + " must be a public HTTPS address for browser deployments. " +
        "For intentional local testing only, set CROPMATICS_LOCAL_PREVIEW=1 and rebuild.",
    );
  }
  let path = collapsePrefix(parsed.pathname).replace(/\/+$/, "");
  if (path === "" || path === "/api") path = API_PATH_PREFIX;
  return parsed.origin + path;
}

let cached: string | null = null;

export function apiBaseUrl(): string {
  if (cached === null) cached = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  return cached;
}

export function resetApiBaseUrlCache(): void {
  cached = null;
}

export function apiUrl(path: string, qs = ""): string {
  let suffix = collapsePrefix(path.startsWith("/") ? path : "/" + path);
  if (suffix === API_PATH_PREFIX || suffix.startsWith(API_PATH_PREFIX + "/")) {
    suffix = suffix.slice(API_PATH_PREFIX.length);
  }
  return apiBaseUrl() + suffix + (qs ? "?" + qs : "");
}
