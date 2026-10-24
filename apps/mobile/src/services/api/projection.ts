import { qs, request } from "./client";

export type ProjectionGeography = "district" | "national";
export type ProjectionMetric = "yield_kg_ha" | "production_mt";
export type ProjectionMethod = "carry_forward" | "percent_change" | "personal";

export interface ProjectionOriginOption {
  period_code: string;
  period_label: string;
  kind: "observed" | "assumed";
  value?: number | null;
  unit?: string | null;
  source_id?: string | null;
}

export interface ProjectionOriginsResponse {
  season: string;
  metric: ProjectionMetric;
  origins: ProjectionOriginOption[];
  note?: string | null;
}

export interface ManualProjectionRequest {
  crop: string;
  geography: ProjectionGeography;
  district?: string | null;
  season: string;
  origin_period?: string | null;
  horizon_steps: number;
  metric: ProjectionMetric;
  method: ProjectionMethod;
  baseline: "latest_observed" | "median_window";
  baseline_window?: number | null;
  change_pct?: number | null;
  compounding: "once" | "per_step";
  assumed_yield_kg_ha?: number | null;
  assumed_harvested_area_ha?: number | null;
}

export interface ProjectionBaselineObservation {
  period_code: string;
  period_label: string;
  value: number;
  unit: string;
  source_id?: string | null;
  source_workbook?: string | null;
  source_sheets?: string | null;
}

export interface ProjectionPoint {
  period_code: string;
  period_label: string;
  value: number;
  unit: string;
  is_planning_target: boolean;
}

export interface ProjectionCaseResult {
  label: string;
  change_pct?: number | null;
  compounding?: string | null;
  points: ProjectionPoint[];
  change_from_baseline_pct?: number | null;
}

export interface ManualProjectionResponse {
  calculation_id: string;
  value_kind: string;
  value_kind_label: string;
  assumption_badge: string;
  methodology_version: string;
  dataset_version?: string | null;
  method: ProjectionMethod;
  method_label: string;
  method_note: string;
  baseline: string;
  baseline_label: string;
  baseline_value: number;
  baseline_unit: string;
  baseline_is_assumption: boolean;
  baseline_observations: ProjectionBaselineObservation[];
  baseline_note?: string | null;
  assumptions: Record<string, unknown>;
  cases: ProjectionCaseResult[];
  units: string;
  resolved: {
    crop: string;
    geography: string;
    district?: string | null;
    province?: string | null;
    season: string;
    metric: string;
    metric_unit: string;
    origin_period: string;
    origin_label: string;
    origin_kind: "observed" | "assumed";
    horizon_steps: number;
    target_periods: string[];
  };
  evidence: {
    source_id?: string | null;
    period_code?: string | null;
    metric?: string | null;
    geography?: string | null;
    value?: number | null;
    unit?: string | null;
    value_kind?: string;
    source_workbook?: string | null;
    source_sheets?: string | null;
  }[];
  warnings: string[];
  limitations: string[];
  provenance: {
    source_id?: string | null;
    source_period?: string | null;
    method?: string | null;
    limitations?: string[];
    [key: string]: unknown;
  };
}

export function buildManualProjectionPayload(input: {
  crop: string;
  geography: ProjectionGeography;
  district?: string | null;
  season: string;
  originPeriod?: string | null;
  horizonSteps: number;
  metric: ProjectionMetric;
  method: ProjectionMethod;
  changePct?: number | null;
  assumedYield?: number | null;
  assumedArea?: number | null;
}): ManualProjectionRequest {
  const payload: ManualProjectionRequest = {
    crop: input.crop,
    geography: input.geography,
    district: input.geography === "district" ? input.district ?? null : null,
    season: input.season,
    origin_period: input.originPeriod || null,
    horizon_steps: input.horizonSteps,
    metric: input.metric,
    method: input.method,
    baseline: "latest_observed",
    compounding: "once",
  };

  if (input.method === "percent_change") payload.change_pct = input.changePct ?? null;
  if (input.method === "personal") {
    payload.assumed_yield_kg_ha = input.assumedYield ?? null;
    payload.assumed_harvested_area_ha = input.assumedArea ?? null;
  }
  return payload;
}

export const projectionApi = {
  origins: (params: {
    crop: string;
    season: string;
    geography: ProjectionGeography;
    district?: string;
    metric: ProjectionMetric;
    method: ProjectionMethod;
  }) =>
    request<ProjectionOriginsResponse>(
      `/scenarios/manual-projection/origins${qs({
        crop: params.crop,
        season: params.season,
        district: params.geography === "district" ? params.district : undefined,
        metric: params.metric,
        method: params.method,
      })}`,
    ),
  calculate: (payload: ManualProjectionRequest) =>
    request<ManualProjectionResponse>("/scenarios/manual-projection", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
