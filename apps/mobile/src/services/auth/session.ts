import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "cropmatics.auth.session";

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: "bearer" | string;
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AuthSession>;
    if (!value.access_token || !value.refresh_token) return null;
    return {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      token_type: value.token_type ?? "bearer",
    };
  } catch {
    return null;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
