/**
 * Main API service — re-exports all sub-clients and preserves the legacy `api`
 * object so existing field-operations code continues to work unchanged.
 */
import type {
  FacilityContext,
  FacilityContextResponse,
  PostHarvestRisk,
  RiskResult,
  StorageInfrastructure,
} from "../types";
import { BASE_URL as BASE } from "./api/client";

export { cropsApi } from "./api/crops";
export { districtsApi } from "./api/districts";
export { askApi } from "./api/ask";
export { inquiryApi } from "./api/inquiry";
export { metaApi } from "./api/meta";
export { analyticsApi } from "./api/analytics";
export { homeApi } from "./api/home";
export { indicatorsApi } from "./api/indicators";
export { mapsApi } from "./api/maps";
export { postHarvestApi } from "./api/postharvest";
export { sourcesApi } from "./api/sources";
export { authApi } from "./api/auth";
export { BASE_URL, API_CONFIG, PRODUCTION_API_BASE_URL } from "./api/client";
export {
  ApiError,
  NetworkError,
  TimeoutError,
  NotFoundError,
  ValidationError,
  UnsupportedDataError,
  ServerError,
} from "./api/client";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface HarvestPayload {
  district: string;
  crop: string;
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

export interface FarmPayload {
  client_uuid: string;
  name: string;
  district: string;
  sector?: string | null;
  farm_size_ha?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface FarmResponse {
  id: string;
  client_uuid: string | null;
}

export interface RiskPayload {
  crop: string;
  expected_quantity_kg?: number | null;
  rainfall_risk?: string | null;
  distance_km?: number | null;
  capacity_available_kg?: number | null;
}

/** Legacy api object — preserved for field-operations screens. */
export const api = {
  baseUrl: BASE,
  createHarvest: (payload: HarvestPayload) =>
    request<HarvestResponse>("/harvests", { method: "POST", body: JSON.stringify(payload) }),
  createFarm: (payload: FarmPayload) =>
    request<FarmResponse>("/farms", { method: "POST", body: JSON.stringify(payload) }),
  scoreRisk: (harvestId: string) =>
    request<RiskResult & { harvest_id: string }>(`/harvests/${harvestId}/risk`, { method: "POST" }),
  scorePostHarvestRisk: (payload: RiskPayload) =>
    request<PostHarvestRisk>("/risk/post-harvest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  coverage: () =>
    request<{ coverage: Record<string, Record<string, string>>; notes: string[] }>(
      "/meta/data-coverage",
    ),
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
  programContext: (district?: string) =>
    request<FacilityContextResponse>(
      `/facilities/program-context${district ? `?district=${encodeURIComponent(district)}` : ""}`,
    ),
  storageInfrastructure: () => request<StorageInfrastructure>("/analytics/storage-infrastructure"),
};
