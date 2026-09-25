import Constants from "expo-constants";

import type { RiskResult } from "../types";

const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface HarvestPayload {
  district: string;
  crop: string;
  expected_harvest_date?: string | null;
  expected_quantity_kg?: number | null;
  client_uuid: string;
}

export interface HarvestResponse {
  id: string;
  sync_status: string;
}

export const api = {
  baseUrl: BASE_URL,
  createHarvest: (payload: HarvestPayload) =>
    request<HarvestResponse>("/harvests", { method: "POST", body: JSON.stringify(payload) }),
  scoreRisk: (harvestId: string) =>
    request<RiskResult & { harvest_id: string }>(`/harvests/${harvestId}/risk`, { method: "POST" }),
};
