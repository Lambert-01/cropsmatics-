import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSession, saveSession } from "../src/services/auth/session";
import { request } from "../src/services/api/client";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));

describe("authenticated mobile API requests", () => {
  afterEach(async () => {
    await clearSession();
    vi.unstubAllGlobals();
  });

  it("sends the stored access token as a bearer credential", async () => {
    await saveSession({
      access_token: "access-1",
      refresh_token: "refresh-1",
      token_type: "bearer",
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request<{ ok: boolean }>("/harvests/1")).resolves.toEqual({ ok: true });

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo, RequestInit]>;
    const init = calls[0]?.[1];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-1");
  });

  it("refreshes once after a 401 and retries the original request", async () => {
    await saveSession({
      access_token: "expired-access",
      refresh_token: "refresh-1",
      token_type: "bearer",
    });
    const responses = [
      { ok: false, status: 401, json: async () => ({ detail: "expired" }) },
      {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "access-2",
          refresh_token: "refresh-2",
          token_type: "bearer",
        }),
      },
      { ok: true, status: 200, json: async () => ({ id: "h-1" }) },
    ];
    const fetchMock = vi.fn(async () => responses.shift());
    vi.stubGlobal("fetch", fetchMock);

    await expect(request<{ id: string }>("/harvests/h-1")).resolves.toEqual({ id: "h-1" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo, RequestInit]>;
    expect(String(calls[1]?.[0])).toContain("/auth/refresh");
    const retryInit = calls[2]?.[1];
    expect(new Headers(retryInit.headers).get("Authorization")).toBe("Bearer access-2");
  });
});
