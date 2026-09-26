import Constants from "expo-constants";

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromConfig = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();
  if (fromConfig) return fromConfig;
  return "http://localhost:8000/api/v1";
}

export const BASE_URL = resolveBaseUrl();

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}
