/** Shared API types. These mirror the FastAPI view models exactly. */

export interface Provenance {
  source_id?: string | null;
  source_period?: string | null;
  model_version?: string | null;
  benchmark_strategy?: string | null;
  method?: string | null;
  limitations?: string[];
}

export interface District {
  district_code: string;
  district: string;
  province?: string | null;
  agro_ecological_zone?: string | null;
}

export interface Crop {
  crop_code: string;
  crop_name: string;
  category?: string | null;
  kinyarwanda_name?: string | null;
  perishability?: string | null;
  cold_chain_recommended?: boolean | null;
}

export interface KPI {
  id: string;
  label: string;
  value: number | null;
  unit?: string | null;
  period?: string | null;
  source_id?: string | null;
  note?: string | null;
}

export interface OverviewResponse {
  filters: Record<string, string | number | null>;
  period?: string | null;
  available_periods: string[];
  coverage: Record<string, string>;
  coverage_level?: string | null;
  n_observations: number;
  kpis: KPI[];
  provenance: Provenance;
}

export interface ProductivityResponse {
  period?: string | null;
  n_observations: number;
  kpis: KPI[];
  rows: Record<string, string | number | null>[];
  provenance: Provenance;
}

export interface MapDistrictMetric {
  district: string;
  district_code?: string | null;
  province?: string | null;
  agro_ecological_zone?: string | null;
  value?: number | null;
  n_observations: number;
  details: Record<string, string | number | null | undefined>;
}

export interface MapMetricsResponse {
  metric: string;
  metric_label: string;
  unit?: string | null;
  period?: string | null;
  crop?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  districts: MapDistrictMetric[];
  provenance: Provenance;
}

export interface TrendPoint {
  period: string;
  year?: number | null;
  season?: string | null;
  values: Record<string, number | null>;
}

export interface TrendResponse {
  crop?: string | null;
  /** Populated only for the optional compare view (2-5 crops). */
  compared_crops?: string[] | null;
  kind: string;
  metric_units: Record<string, string>;
  points: TrendPoint[];
  provenance: Provenance;
}

export interface FactorMetric {
  factor: string;
  label: string;
  correlation?: number | null;
  absolute_correlation?: number | null;
  n_observations: number;
  direction?: string | null;
  interpretation: string;
}

export interface FactorsResponse {
  crop?: string | null;
  district?: string | null;
  factors: FactorMetric[];
  provenance: Provenance;
}

export interface PostHarvestCrop {
  crop: string;
  sold_pct?: number | null;
  own_consumption_pct?: number | null;
  stored_pct?: number | null;
  post_harvest_losses_pct?: number | null;
  seeds_pct?: number | null;
  fodder_pct?: number | null;
  other_usage_pct?: number | null;
  shares_sum_ok?: boolean | null;
  risk_band?: string | null;
}

export interface PostHarvestResponse {
  kpis: KPI[];
  crops: PostHarvestCrop[];
  provenance: Provenance;
}

export interface HeatmapCell {
  district: string;
  crop: string;
  value?: number | null;
}

export interface HeatmapResponse {
  metric: string;
  districts: string[];
  crops: string[];
  cells: HeatmapCell[];
  max_value?: number | null;
  min_value?: number | null;
  unit?: string | null;
  provenance: Provenance;
}

export interface CoverageResponse {
  coverage: Record<string, Record<string, string>>;
  details: Record<string, string | number | null>[];
  notes: string[];
}

export interface SourceItem {
  dataset?: string | null;
  owner?: string | null;
  type?: string | null;
  coverage?: string | null;
  use?: string | null;
  access_status?: string | null;
  url?: string | null;
  official_page?: string | null;
  redistribution_note?: string | null;
}

export interface SourcesResponse {
  sources: SourceItem[];
  provenance: Provenance;
}

export interface ModelInfo {
  name: string;
  version?: string | null;
  target?: string | null;
  mae?: number | null;
  rmse?: number | null;
  r2?: number | null;
  n_train?: number | null;
  n_test?: number | null;
  training_period?: string | null;
  validation_method?: string | null;
  status: string;
  note?: string | null;
}

export interface ModelsResponse {
  models: ModelInfo[];
  provenance: Provenance;
}

export interface FacilityItem {
  district: string;
  district_code?: string | null;
  initiative?: string | null;
  context?: string | null;
  capacity_kg?: number | null;
  capacity_status: string;
  capacity_note?: string | null;
  source_id?: string | null;
}

export interface FacilitiesResponse {
  capacity_not_verified: boolean;
  facilities: FacilityItem[];
  note: string;
  provenance: Provenance;
}

// --- national storage infrastructure (MINAGRI add-on) ----------------------

export interface InfrastructureItem {
  infrastructure_type?: string | null;
  existing_number?: number | null;
  existing_capacity_mt?: number | null;
  new_number?: number | null;
  new_capacity_mt?: number | null;
  total_number?: number | null;
  total_capacity_mt?: number | null;
  period?: string | null;
  source_url?: string | null;
}

export interface InfrastructureTotals {
  existing_number?: number | null;
  existing_capacity_mt?: number | null;
  new_number?: number | null;
  new_capacity_mt?: number | null;
  total_number?: number | null;
  total_capacity_mt?: number | null;
  capacity_unit: string;
  period?: string | null;
  note?: string | null;
}

export interface ProgramIndicator {
  indicator?: string | null;
  value?: number | null;
  unit?: string | null;
  notes?: string | null;
  period?: string | null;
  source_url?: string | null;
}

export interface ColdChainProgram {
  indicators: ProgramIndicator[];
  program_districts: string[];
  facility_capacity: null;
  facility_capacity_status: string;
  facility_location_status: string;
  note?: string | null;
}

export interface StorageInfrastructureResponse {
  level_of_analysis: string;
  label: string;
  items: InfrastructureItem[];
  totals?: InfrastructureTotals | null;
  program: ColdChainProgram;
  provenance: Provenance;
}

// --- data readiness / version ----------------------------------------------

export interface ReadinessResponse {
  status: string;
  version: string;
  datasets: Record<string, boolean>;
  row_counts: Record<string, number | null>;
  dictionaries: boolean;
  database: string;
  model: string;
  checks: { check: string; status: string }[];
}

export interface DataVersionResponse {
  available: boolean;
  pipeline_version?: string | null;
  git_sha?: string | null;
  build_timestamp?: string | null;
  row_counts: Record<string, number>;
  validation: {
    status?: string | null;
    errors?: number;
    warnings?: number;
    issues?: { level: string; dataset: string; message: string; count: number }[];
  };
  dataset_count: number;
}

export interface PriorityRow {
  id: string;
  district: string;
  crop: string;
  score: number;
  band: string;
  yield_kg_ha?: number | null;
  benchmark_yield_kg_ha?: number | null;
  harvested_area_ha?: number | null;
  gap: number;
  vulnerability: number;
  affected_scale: number;
  readiness: number;
  cost_constraint: number;
}

export interface PriorityResponse {
  weights: Record<string, number>;
  rows: PriorityRow[];
  proxy_notes: string[];
  provenance: Provenance;
}

export interface DatasetInfo {
  key: string;
  label: string;
  source_id: string;
}

export interface DatasetResponse {
  key: string;
  label: string;
  source_id: string;
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  count: number;
  offset: number;
  limit: number;
}

export interface AllocationRequest {
  sources: { id: string; quantity_kg: number; crop: string }[];
  facilities: {
    id: string;
    capacity_kg: number | null;
    storage_cost_per_kg?: number;
    crops?: string[];
    cold_chain?: boolean;
  }[];
  distances?: Record<string, number>;
  max_distance_km?: number | null;
}

export interface AllocationResponse {
  status: string;
  total_cost: number;
  assignments: { source: string; facility: string; quantity_kg: number }[];
  unassigned: Record<string, unknown>[];
  capacity_not_verified: string[];
  notes: string[];
}

export interface DistrictFeatureProperties {
  district: string;
  district_code: string;
  province: string;
  agro_ecological_zone: string;
}
