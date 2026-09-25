import Constants from "expo-constants";

import type {
  FacilityContext,
  FacilityContextResponse,
  PostHarvestRisk,
  RiskResult,
  StorageInfrastructure,
} from "../types";

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
  /** Canonical unit is kilograms. */
  expected_quantity_kg?: number | null;
  harvest_start_date?: string | null;
  harvest_end_date?: string | null;
  expected_harvest_date?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  needs_storage_assistance?: boolean;
  farm_client_uuid?: string | null;
  client_uuid: string;
}

export interface HarvestResponse {
  id: string;
  sync_status: string;
}

export interface RiskPayload {
  crop: string;
  expected_quantity_kg?: number | null;
  rainfall_risk?: string | null;
  distance_km?: number | null;
  capacity_available_kg?: number | null;
}

export const api = {
  baseUrl: BASE_URL,
  createHarvest: (payload: HarvestPayload) =>
    request<HarvestResponse>("/harvests", { method: "POST", body: JSON.stringify(payload) }),
  scoreRisk: (harvestId: string) =>
    request<RiskResult & { harvest_id: string }>(`/harvests/${harvestId}/risk`, { method: "POST" }),
  /**
   * Stateless risk scoring: works before sync, and also for a harvest that has
   * no server id yet. The score is always produced by the server — the app never
   * computes it locally.
   */
  scorePostHarvestRisk: (payload: RiskPayload) =>
    request<PostHarvestRisk>("/risk/post-harvest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  coverage: () =>
    request<{
      coverage: Record<string, Record<string, string>>;
      notes: string[];
    }>("/meta/data-coverage"),
  dataVersion: () =>
    request<{
      available: boolean;
      pipeline_version?: string | null;
      build_timestamp?: string | null;
      validation?: { status?: string; errors?: number; warnings?: number };
    }>("/meta/data-version"),
  facilityContext: (district?: string) =>
    request<{ facilities: FacilityContext[]; capacity_not_verified: boolean; note: string }>(
      `/facilities/context${district ? `?district=${encodeURIComponent(district)}` : ""}`,
    ),
  /** Program membership only — no capacity and no coordinates are published. */
  programContext: (district?: string) =>
    request<FacilityContextResponse>(
      `/facilities/program-context${district ? `?district=${encodeURIComponent(district)}` : ""}`,
    ),
  /** National MINAGRI infrastructure totals — never joined to a district. */
  storageInfrastructure: () => request<StorageInfrastructure>("/analytics/storage-infrastructure"),
};
