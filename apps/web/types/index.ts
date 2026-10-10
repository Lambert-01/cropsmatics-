/** Shared API types. These mirror the FastAPI view models exactly. */

export interface Provenance {
  source_id?: string | null;
  source_period?: string | null;
  /** Set when a result mixes a period-specific input with a single-release one. */
  reference_period?: string | null;
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
  /** Canonical YYYYS period this specific number describes. */
  period_code?: string | null;
  source_id?: string | null;
  note?: string | null;
  /** "selection" describes the current selection; "context" is another release. */
  scope?: "selection" | "context" | string;
}

export interface OverviewResponse {
  filters: Record<string, string | number | null>;
  period?: string | null;
  period_code?: string | null;
  available_periods: string[];
  coverage: Record<string, string>;
  coverage_level?: string | null;
  n_observations: number;
  kpis: KPI[];
  /** At most four, one scope and one period. Render these as the headline row. */
  primary_kpis: KPI[];
  secondary_kpis: KPI[];
  provenance: Provenance;
}

/** One band of the yield-gap distribution, with its own cut points. */
export interface GapBand {
  id: string;
  label: string;
  min_pct?: number | null;
  max_pct?: number | null;
  count: number;
  share_pct?: number | null;
}

/**
 * Same-season, previous-year yield change. Seasons differ agronomically, so this
 * compares the same season one year earlier (2025B vs 2026B) rather than
 * stepping A -> B -> C as if it were a time series.
 */
export interface SameSeasonYoY {
  available: boolean;
  reason?: string | null;
  period_code?: string | null;
  period_label?: string | null;
  previous_period_code?: string | null;
  previous_period_label?: string | null;
  current_yield_kg_ha?: number | null;
  previous_yield_kg_ha?: number | null;
  change_pct?: number | null;
  crop?: string | null;
  district?: string | null;
  province?: string | null;
  note?: string | null;
}

export interface ProductivityResponse {
  period?: string | null;
  period_code?: string | null;
  n_observations: number;
  kpis: KPI[];
  primary_kpis: KPI[];
  secondary_kpis: KPI[];
  /** Null when no crop is selected: a cross-crop mean yield is meaningless. */
  yoy?: SameSeasonYoY | null;
  gap_bands: GapBand[];
  rows: Record<string, string | number | null>[];
  provenance: Provenance;
}

// --- canonical period-aware productivity panel --------------------------------

export interface PeriodTrendPoint {
  period_code: string;
  year: number;
  season: string;
  label: string;
  values: {
    cultivated_area_ha?: number | null;
    harvested_area_ha?: number | null;
    production_mt?: number | null;
    yield_kg_ha?: number | null;
  };
}

export interface PeriodTrendResponse {
  crop: string;
  district?: string | null;
  geography_scope: string;
  unit: Record<string, string>;
  points: PeriodTrendPoint[];
  available_periods: string[];
  provenance: Provenance;
}

// --- analytical scenarios (Yield Scenario Lab) --------------------------------

/**
 * The reviewable assumptions that define one side of a scenario. Both sides are
 * described independently: an unset field takes its own side's default, and an
 * unset group field means "no restriction". Nothing is inherited from the other
 * side, so the response always shows exactly what was compared.
 */
export interface ScenarioParams {
  period_code?: string | null;
  benchmark_strategy?: string | null;
  gap_threshold_pct?: number | null;
  province?: string | null;
  district?: string | null;
  ranking_criterion?: string | null;
}

export interface ScenarioRequest {
  crop: string;
  baseline: ScenarioParams;
  scenario: ScenarioParams;
}

export interface ScenarioDistrictRow {
  district: string;
  /** Null when the district has no published value for the ranking criterion. */
  rank: number | null;
  district_code?: string | null;
  province?: string | null;
  yield_kg_ha?: number | null;
  benchmark_yield_kg_ha?: number | null;
  gap_index?: number | null;
  harvested_area_ha?: number | null;
  production_mt?: number | null;
  below_benchmark: boolean;
  below_threshold: boolean;
}

export interface ScenarioViewStats {
  /** Districts actually shown (the selected group). */
  n_districts: number;
  n_below_benchmark: number;
  n_below_threshold: number;
  ranked_districts: number;
  unranked_districts: number;
  mean_gap_index: number | null;
  mean_yield_kg_ha: number | null;
  total_production_mt: number | null;
  total_harvested_area_ha: number | null;
  /**
   * Districts the benchmark was measured over — the whole published set for the
   * crop, not the displayed group. Larger than `n_districts` when a group is
   * selected, which is what shows the reference level did not move.
   */
  n_benchmark_districts: number;
  benchmark_scope?: string | null;
}

/** One side of the comparison. `missing` means the crop was not tabulated. */
export interface ScenarioView {
  period_code?: string | null;
  period_label?: string | null;
  crop: string;
  benchmark_strategy: string;
  gap_threshold_pct: number;
  ranking_criterion: string;
  ranking_criterion_label: string;
  ranking_criterion_unit?: string | null;
  ranking_criterion_note?: string | null;
  province?: string | null;
  district?: string | null;
  missing: boolean;
  reason?: string | null;
  n_observations: number;
  source_id?: string | null;
  rows: ScenarioDistrictRow[];
  gap_bands: GapBand[];
  stats: ScenarioViewStats;
}

/** `movement` is `rank_before - rank_after`; positive means the district moved up. */
export interface RankMovementRow {
  district: string;
  rank_before: number | null;
  rank_after: number | null;
  movement: number | null;
  direction: "up" | "down" | "unchanged" | "new" | "dropped" | "unranked" | string;
  gap_before: number | null;
  gap_after: number | null;
  yield_before: number | null;
  yield_after: number | null;
  below_threshold_before: boolean | null;
  below_threshold_after: boolean | null;
}

export interface RankMovement {
  districts: RankMovementRow[];
  n_compared: number;
  n_moved: number;
  n_unchanged: number;
  /** Districts that only appear on one side because the group itself changed. */
  entered_group: string[];
  left_group: string[];
  entered_priority: string[];
  left_priority: string[];
}

export interface ScenarioChange {
  parameter: string;
  label: string;
  before: unknown;
  after: unknown;
}

/** Mode B. Only enabled when a validated model card is actually registered. */
export interface ModelScenarioAvailability {
  available: boolean;
  reason: string;
  model_name?: string | null;
  model_version?: string | null;
  metrics: Record<string, number>;
  warning: string;
}

/**
 * The result of an analytical scenario. `scenario_type` is always
 * `"analytical"`: this is a re-computation of published observations under
 * different assumptions, never a prediction.
 */
export interface ScenarioResponse {
  scenario_type: "analytical";
  scenario_label: string;
  crop: string;
  baseline: ScenarioView;
  scenario: ScenarioView;
  changes: ScenarioChange[];
  ranking_movement: RankMovement;
  model_scenario: ModelScenarioAvailability;
  available_periods: string[];
  available_benchmark_strategies: string[];
  available_ranking_criteria: { id: string; label: string; unit?: string | null; note?: string | null }[];
  provenance: Provenance;
  limitations: string[];
}

// --- market intelligence ------------------------------------------------------

/** Date range an observation set actually covers. Null when there are none. */
export interface MarketDateCoverage {
  start: string;
  end: string;
}

/**
 * Whether verified market prices are loaded. `data_available: false` is a
 * first-class state, not an error: the schema is registered but no attributable
 * price feed has been ingested, so no price is shown.
 */
export interface MarketStatus {
  data_available: boolean;
  observations: number;
  rows_in_file: number;
  /** Fixture rows, excluded from every figure. */
  synthetic_rows: number;
  table_present: boolean;
  schema_columns: string[];
  reason: string | null;
  manifest: { file?: string | null; rows?: number | null; sha256?: string | null };
  registered_sources: Record<string, unknown>[];
  date_coverage: MarketDateCoverage | null;
  commodity_count: number;
  market_count: number;
  district_count: number;
  province_count: number;
  price_types_present: string[];
  price_types_supported: string[];
  notes: string[];
}

/** One observation, with the currency and unit it was published in. */
export interface MarketObservation {
  observation_key?: string | null;
  observation_date?: string | null;
  commodity_name_raw?: string | null;
  variety?: string | null;
  market_name?: string | null;
  district?: string | null;
  province?: string | null;
  price_type?: string | null;
  price_value_original?: number | null;
  currency_original?: string | null;
  unit_original?: string | null;
  conversion_basis?: string | null;
  price_rwf_per_kg?: number | null;
  source_id?: string | null;
  source_url?: string | null;
  is_synthetic?: boolean;
}

/**
 * A price series for ONE price type. The API never returns a single series
 * spanning several types, because that would compare different measurements.
 */
export interface MarketTrendSeries {
  price_type: string;
  unit: string;
  unit_basis?: string | null;
  points: { date: string; value: number }[];
  n_observations: number;
}

/** Observed range for ONE price type. */
export interface MarketDispersionGroup {
  price_type: string;
  unit: string;
  n_observations: number;
  minimum: number;
  maximum: number;
  median: number;
  range: number;
  markets: number;
}

// --- assistant (grounded explanation layer) -----------------------------------

/**
 * Names the calling page's selection so a contextual action is grounded in the
 * same period/crop/district the user is viewing. It carries entities only —
 * never a value — so it cannot inject a figure into an answer.
 */
export interface AssistantContext {
  page?: string;
  metric?: string;
  period_code?: string;
  crop?: string;
  district?: string;
  province?: string;
  benchmark_strategy?: string;
}

export interface AssistantFigure {
  label: string;
  value: number | string;
  unit?: string | null;
  period_code?: string | null;
  district?: string | null;
  crop?: string | null;
  source_id?: string | null;
}

export interface AssistantSourceRef {
  source_id: string;
  name?: string | null;
  period?: string | null;
}

/**
 * The structured response contract the backend returns under `structured`. The
 * web client renders this rather than parsing the prose, so every figure is shown
 * with the period, unit and source it was published under.
 */
export interface AssistantStructured {
  answer_id?: string;
  intent: string;
  title?: string;
  summary?: string;
  language?: string;
  depth?: string;
  audience?: string;
  key_findings?: string[];
  figures?: AssistantFigure[];
  interpretation?: string[];
  limitations?: string[];
  methodology?: string[];
  sources?: AssistantSourceRef[];
  suggested_followups?: string[];
  actions?: { type: string; label: string; crop?: string | null; district?: string | null }[];
  warnings?: string[];
}

export interface AssistantResponse {
  answer: string;
  grounded: boolean;
  intent: string;
  evidence: Record<string, unknown>;
  key_figures: { label?: string | null; value?: number | null; unit?: string | null }[];
  source?: string | null;
  period?: string | null;
  coverage?: string | null;
  limitations: string[];
  /** Additive engine metadata; older responses may omit it. */
  structured?: AssistantStructured;
  conversation_id?: string | null;
  answer_mode?: "deterministic" | "llm";
  warnings?: string[];
  citations?: string[];
  evidence_count?: number;
  tools_used?: string[];
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
  period_code?: string | null;
  crop?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  districts: MapDistrictMetric[];
  /** True when the metric needs a crop selection (yield). */
  requires_crop?: boolean;
  message?: string | null;
  /** The release that does carry the metric when the selected period does not. */
  available_period?: string | null;
  /**
   * Always null under the exclude-and-reweight policy: no map value is reported
   * as a blend of two releases.
   */
  reference_period?: string | null;
  /** Priority components with no measured value for the selected period. */
  components_unavailable?: string[];
  component_availability?: ComponentAvailability[];
  source_id?: string | null;
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
  /** Set when the requested period has no factor data at all. */
  note?: string | null;
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

// --- period catalogue -------------------------------------------------------

/** How one dataset covers one period (from /meta/periods). */
export interface PeriodDatasetCoverage {
  dataset: string;
  coverage_level: string;
  n_districts: number;
  n_crops: number;
  source_id?: string | null;
}

/** One published period. The catalogue is derived from the data, never fixed. */
export interface PeriodInfo {
  period_code: string;
  year: number;
  season: string;
  label: string;
  coverage_level?: string | null;
  n_districts: number;
  n_crops: number;
  datasets: PeriodDatasetCoverage[];
  is_latest: boolean;
  is_latest_district: boolean;
}

export interface PeriodsResponse {
  count: number;
  latest?: string | null;
  latest_district?: string | null;
  periods: PeriodInfo[];
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
  /**
   * `null` means the component has no measured value for the selected period, so
   * its weight was redistributed rather than applied to a neutral constant. The
   * UI must render "not available", never `0`.
   */
  readiness: number | null;
  cost_constraint: number | null;
}

/** Whether a priority component is measured, a proxy, unavailable or unknown. */
export type ComponentStatus = "measured" | "proxy" | "unavailable" | "undetermined";

export interface ComponentAvailability {
  component: string;
  label: string;
  status: ComponentStatus;
  source_period?: string | null;
  note?: string | null;
}

export interface PriorityResponse {
  weights: Record<string, number>;
  rows: PriorityRow[];
  proxy_notes: string[];
  /** Components excluded for this period, with their weight redistributed. */
  components_unavailable: string[];
  component_availability: ComponentAvailability[];
  provenance: Provenance;
}

// --- intervention priority scenarios ------------------------------------------

/**
 * The planner's own weight vocabulary. These are the only weights a request may
 * carry; the server maps them onto its engine keys and normalises them.
 */
export interface PlannerWeights {
  gap: number;
  vulnerability: number;
  affected_scale: number;
  readiness: number;
  cost: number;
}

/** One independently-specified side of a priority scenario. */
export interface PriorityScenarioParams {
  weights?: PlannerWeights;
  period_code?: string | null;
  benchmark_strategy?: string | null;
  province?: string | null;
  district?: string | null;
  crop?: string | null;
  /** How many ranked candidates count as the review shortlist. */
  top_n?: number;
  min_score?: number;
}

export interface PriorityScenarioRequest {
  baseline: PriorityScenarioParams;
  scenario: PriorityScenarioParams;
}

/** One district × crop candidate as the engine ranked it. */
export interface PriorityCandidateRow {
  id: string;
  district: string;
  crop?: string | null;
  rank: number;
  score: number;
  band: string;
  in_priority_group: boolean;
  in_top_n: boolean;
}

export interface PriorityViewStats {
  n_candidates: number;
  n_priority_group: number;
  n_top_n: number;
  band_counts: Record<string, number>;
  mean_score: number | null;
}

/** One side of the comparison. `missing` means the selection has no candidates. */
export interface PriorityView {
  label?: string | null;
  /** Engine-keyed weights actually used (wg/wv/wf/wr/wc). */
  weights: Record<string, number>;
  top_n: number;
  period_code?: string | null;
  period_label?: string | null;
  crop?: string | null;
  province?: string | null;
  district?: string | null;
  benchmark_strategy?: string | null;
  missing: boolean;
  reason?: string | null;
  source_id?: string | null;
  n_observations: number;
  /** Components excluded for this side's period, with their weight redistributed. */
  components_unavailable: string[];
  component_availability: ComponentAvailability[];
  rows: PriorityCandidateRow[];
  stats: PriorityViewStats;
}

/** `movement` is `rank_before - rank_after`; positive means the candidate rose. */
export interface PriorityMovementRow {
  district: string;
  rank_before: number | null;
  rank_after: number | null;
  movement: number | null;
  direction: "up" | "down" | "unchanged" | "new" | "dropped" | "unranked" | string;
  score_before: number | null;
  score_after: number | null;
  band_before: string | null;
  band_after: string | null;
  in_top_n_before: boolean | null;
  in_top_n_after: boolean | null;
}

export interface PriorityMovement {
  districts: PriorityMovementRow[];
  n_compared: number;
  n_moved: number;
  n_unchanged: number;
  /** Candidates that only exist on one side because the selection changed. */
  entered_group: string[];
  left_group: string[];
  entered_priority: string[];
  left_priority: string[];
}

/** Per-weight change, so a weighting scenario explains itself. */
export interface WeightDelta {
  key: string;
  label?: string | null;
  before: number | null;
  after: number | null;
  delta: number | null;
}

/**
 * The result of an analytical priority scenario. `scenario_type` is always
 * `"analytical"`: this re-ranks published observations, it is never a budget
 * model or a statement of what an intervention would achieve.
 */
export interface PriorityScenarioResponse {
  scenario_type: "analytical";
  scenario_label: string;
  baseline: PriorityView;
  scenario: PriorityView;
  changes: ScenarioChange[];
  weight_deltas: WeightDelta[];
  ranking_movement: PriorityMovement;
  available_periods: string[];
  available_benchmark_strategies: string[];
  /** Engine-keyed named planning positions, comparable with `PriorityView.weights`. */
  available_presets: Record<string, Record<string, number>>;
  preset_labels: Record<string, string>;
  weight_labels: Record<string, string>;
  proxy_notes: string[];
  /** Union of the components excluded on either side. */
  components_unavailable: string[];
  component_availability: ComponentAvailability[];
  provenance: Provenance;
  limitations: string[];
}

// --- ranking sensitivity -------------------------------------------------------

export interface SensitivityRequest {
  weights?: PlannerWeights;
  period_code?: string | null;
  benchmark_strategy?: string | null;
  province?: string | null;
  district?: string | null;
  crop?: string | null;
  /** Random weightings drawn on the simplex (0 = presets only). */
  n_random?: number;
  /** Makes the sweep exactly reproducible. */
  seed?: number;
  top_n?: number;
  include_presets?: boolean;
}

/** How one candidate behaves across the whole tested sweep. */
export interface SensitivityRow {
  id: string;
  district: string;
  crop?: string | null;
  baseline_rank: number;
  baseline_band: string;
  baseline_score: number;
  top_n_inclusions: number;
  /** Fraction of tested weightings in which the candidate stayed in the top-N. */
  top_n_share_pct: number;
  band_counts: Record<string, number>;
  band_shares_pct: Record<string, number>;
  dominant_band: string;
  band_stability_pct: number;
  best_rank: number;
  median_rank: number;
  worst_rank: number;
  rank_range: number;
  robust: boolean;
}

/**
 * The result of a robustness sweep. The shares are **robustness shares across
 * tested weightings, not probabilities** — `disclaimer` says so on the response.
 */
export interface SensitivityResponse {
  /** Engine-keyed weights actually used. */
  weights: Record<string, number>;
  weight_labels: Record<string, string>;
  presets: Record<string, Record<string, number>>;
  preset_labels: Record<string, string>;
  rows: SensitivityRow[];
  districts_analysed: number;
  robust_count: number;
  n_scenarios_tested: number;
  n_random_draws: number;
  presets_included: string[];
  seed: number;
  top_n: number;
  proxy_notes: string[];
  /** Components excluded from every tested weighting because they are unmeasured. */
  components_unavailable: string[];
  component_availability: ComponentAvailability[];
  disclaimer: string;
  limitations: string[];
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

/**
 * One entry of the backend report catalogue (`/reports/catalog`).
 *
 * The Reports workspace renders this rather than a hard-coded list, so a report
 * cannot appear in the interface after it was removed on the server — or go
 * missing from it after being added.
 */
export interface ReportCatalogEntry {
  key: string;
  title: string;
  description: string;
  group: string;
  /** Full API path, e.g. `/reports/crop-productivity.csv`. */
  endpoint: string;
  filename: string;
  formats: string[];
  /** Which shared filters the report actually honours. Empty means none. */
  scope: string[];
  /** What the report covers, and what it deliberately does not. */
  coverage_note: string;
}

export interface DistrictSummaryResponse {
  district: string;
  period_code?: string | null;
  crops: Record<string, string | number | null>[];
  provenance: Provenance;
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
