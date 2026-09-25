import type { Crop, District, GapResponse, PriorityResponse } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  districts: () => get<District[]>("/geography/districts"),
  crops: () => get<Crop[]>("/crops"),
  productivityGap: (strategy = "national_crop_median", limit = 50) =>
    get<GapResponse>(`/analytics/productivity-gap?strategy=${strategy}&limit=${limit}`),
  priorities: (limit = 50) => get<PriorityResponse>(`/analytics/intervention-priorities?limit=${limit}`),
  assistant: (question: string) => post<{ answer: string; grounded: boolean }>("/assistant/query", { question }),
};

export { BASE_URL };
