import Constants from "expo-constants";

/**
 * Distribution URLs.
 *
 * The app is shared as an APK (EAS Build) or as an Expo Go session. Either way
 * the person receiving it needs one web landing page that carries the QR code
 * and install instructions. Everything here is overridable so the same build
 * works for a demo room (LAN API) and for a real deployment (public API).
 *
 * Precedence for each value:
 *   1. EXPO_PUBLIC_* env var at build time (or in apps/mobile/.env)
 *   2. app.json `extra` (baked in by `scripts/build-apk.sh` / eas.json)
 *   3. null — feature is shown as "not configured" instead of a broken link
 */

function resolve(name: string): string | null {
  const fromEnv = process.env[`EXPO_PUBLIC_${name}`]?.trim();
  if (fromEnv) return fromEnv;

  const fromConfig = Constants.expoConfig?.extra?.[name];
  if (typeof fromConfig === "string" && fromConfig.trim()) return fromConfig.trim();

  return null;
}

/** Web landing page that carries the QR code + install instructions. */
export const installPageUrl = resolve("INSTALL_PAGE_URL");

/**
 * URL the QR code on the share screen encodes.
 *
 * Points at the web /install page rather than at a binary: the page renders a
 * large QR + step-by-step instructions, and works for both APK installs and
 * Expo Go. A direct APK URL would expire (EAS link TTL) and break the QR.
 */
export const shareUrl = installPageUrl;

/**
 * Fallback when no landing page is configured: deep-link straight into the
 * app via Expo Go (requires the recipient to already have Expo Go installed).
 */
export const expoGoUrl: string | null = (() => {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  return `https://qr.expo.dev/eas-update?projectId=${projectId}`;
})();

/** The URL shown as text under the QR code, for people who type URLs. */
export const shareUrlText = shareUrl ?? expoGoUrl;

/**
 * The API URL this build talks to — shown on the share screen so a demo
 * organizer can see at a glance whether recipients will reach the API.
 * Installed phones cannot reach localhost, hence the explicit warning.
 */
export const apiBaseUrl: string | null = (() => {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  return fromConfig?.trim() || null;
})();

export function apiIsLocal(apiUrl: string | null): boolean {
  if (!apiUrl) return false;
  return /^(http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)|https?:\/\/\[::1\])/.test(apiUrl);
}

export function apiIsLan(apiUrl: string | null): boolean {
  if (!apiUrl) return false;
  return /^http:\/\/(192\.168|10|172)\./.test(apiUrl);
}
