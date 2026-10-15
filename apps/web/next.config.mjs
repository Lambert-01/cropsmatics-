/** Validate public browser API configuration before producing a deployment. */
const API_PATH_PREFIX = "/api/v1";
const VARIABLE = "NEXT_PUBLIC_API_BASE_URL";

function isLocalHost(hostname) {
  const host = hostname.toLowerCase();
  return ["localhost", "0.0.0.0", "[::1]", "::1"].includes(host) ||
    host.endsWith(".localhost") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

export function normalizeApiPath(pathname) {
  const path = pathname.replace(/(?:\/api\/v1)+/g, API_PATH_PREFIX).replace(/\/+$/, "");
  return path === "" || path === "/api" ? API_PATH_PREFIX : path;
}

export function ensureApiBaseUrl(raw, { production, allowLocal = false }) {
  const value = (raw ?? "").trim();
  if (!value && production && !allowLocal) {
    throw new Error(VARIABLE + " is required for production. Set the deployed HTTPS API base and rebuild.");
  }
  let parsed;
  try {
    parsed = new URL(value || "http://localhost:8000/api/v1");
  } catch {
    throw new Error(VARIABLE + " must be a valid absolute http:// or https:// URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(VARIABLE + " must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error(VARIABLE + " is public and must not contain credentials.");
  }
  const loopback = isLocalHost(parsed.hostname);
  if (production && !allowLocal && (loopback || parsed.protocol !== "https:")) {
    throw new Error(
      VARIABLE + " must be a public HTTPS address for browser deployments. " +
      "For intentional local testing only, set CROPMATICS_LOCAL_PREVIEW=1.",
    );
  }
  return { baseUrl: parsed.origin + normalizeApiPath(parsed.pathname), unset: false, loopback };
}

const allowLocal = process.env.CROPMATICS_LOCAL_PREVIEW === "1";
const { baseUrl } = ensureApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, {
  // Next 14 lint loads production config but emits no browser bundle.
  production: process.env.NODE_ENV === "production" && process.argv[2] !== "lint",
  allowLocal,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_BASE_URL: baseUrl,
    // Derived from the explicit build option, not an independent client setting.
    NEXT_PUBLIC_ALLOW_LOCAL_API: allowLocal ? "1" : "0",
  },
};

export default nextConfig;
