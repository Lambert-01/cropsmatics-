import type { DistrictSummary } from "../../types";
import { qs, request } from "./client";

export interface MetricValue {
  id: string;
  label: string;
  value: number | null;
  unit?: string | null;
}

export interface DistrictProfile {
  district: string;
  district_code: string;
  province: string | null;
  agro_ecological_zone: string | null;
  period: string | null;
  period_label: string | null;
  n_crops_with_data: number;
  largest_production_crops: { crop: string; production_mt: number | null }[];
  crops: { crop: string; crop_code: string | null; production_mt: number | null; harvested_area_ha: number | null; yield_kg_ha: number | null }[];
  factors: MetricValue[];
  land: MetricValue[];
  irrigation: { methods: MetricValue[]; sources: MetricValue[] };
  erosion: MetricValue[];
  cross_crop_yield_mean: null;
  provenance: { source_id?: string | null; source_period?: string | null; method?: string | null; limitations?: string[] };
}

export const districtsApi = {
  list: () => request<DistrictSummary[]>("/geography/districts"),
  provinces: () =>
    request<{ province: string; districts: DistrictSummary[] }[]>("/geography/provinces"),
  get: (slug: string) =>
    request<DistrictSummary>(`/geography/districts/${encodeURIComponent(slug)}`),
  profile: (slug: string) =>
    request<DistrictProfile>(`/mobile/districts/${encodeURIComponent(slug)}`),
  productivity: (district: string) => request<Record<string, unknown>>(`/analytics/productivity${qs({ district })}`),
  factors: (district: string) => request<Record<string, unknown>>(`/analytics/factors${qs({ district })}`),
  irrigation: (district: string) => request<Record<string, unknown>>(`/analytics/irrigation${qs({ district })}`),
  erosion: (district: string) => request<Record<string, unknown>>(`/analytics/erosion${qs({ district })}`),
};
