// Re-export all existing types so nothing breaks
export type {
  SyncStatus,
  QuantityUnit,
  LocalFarm,
  HarvestRegistration,
  HarvestRisk,
  HarvestAttachment,
  RiskFactor,
  RiskAction,
  RiskResult,
  PostHarvestRisk,
  FacilityContext,
  InfrastructureItem,
  ColdChainProgram,
  StorageInfrastructure,
  FacilityContextResponse,
  OutboxItem,
} from "./legacy";

// ---- Reference entities ---------------------------------------------------

export interface CropSummary {
  crop_code: string;
  crop_name: string;
  category: string | null;
  kinyarwanda_name: string | null;
  perishability: string | null;
  cold_chain_recommended: boolean;
}

export interface DistrictSummary {
  district_code: string;
  district: string;
  province: string | null;
  agro_ecological_zone: string | null;
}

// ---- Home -----------------------------------------------------------------

export interface SummaryCard {
  id: string;
  label: string;
  value: number;
  unit?: string | null;
  route?: string | null;
  note?: string | null;
}

export interface FeaturedTopic {
  id: string;
  title: string;
  summary: string;
  route: string;
  source_id?: string | null;
  period?: string | null;
}

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

export interface HomeData {
  latest_period: string | null;
  latest_period_label: string | null;
  latest_period_coverage: string | null;
  crop_count: number;
  district_count: number;
  indicator_count: number;
  source_count: number;
  summary_cards: SummaryCard[];
  featured_topics: FeaturedTopic[];
  suggested_questions: string[];
  coverage_notes: string[];
  data_version: Record<string, unknown>;
  generated_at: string | null;
  provenance: Provenance;
}

// ---- Indicators -----------------------------------------------------------

export interface Indicator {
  id: string;
  label: string;
  category: string;
  dataset: string;
  column: string;
  unit: string | null;
  aggregation: string;
  source_id?: string | null;
  source_label?: string | null;
  source_period?: string | null;
  period: string | null;
  coverage_level: string | null;
  available: boolean;
}

export interface IndicatorCategory {
  id: string;
  label: string;
  indicator_count: number;
  available_count: number;
  available: boolean;
}

export interface IndicatorsResponse {
  latest_period: string | null;
  latest_period_label: string | null;
  categories: IndicatorCategory[];
  indicators: Indicator[];
  provenance: Provenance;
}

// ---- Trends & analytics ---------------------------------------------------

export interface TrendPoint {
  period: string;
  label?: string | null;
  values: Record<string, number | null>;
}

export interface TrendResponse {
  crop?: string | null;
  compared_crops?: string[] | null;
  kind: string;
  metric_units: Record<string, string>;
  points: TrendPoint[];
  provenance: Provenance;
}

export interface ProductivityRow {
  district?: string;
  crop?: string;
  district_code?: string;
  canonical_crop_name?: string;
  yield_kg_ha?: number | null;
  production_mt?: number | null;
  harvested_area_ha?: number | null;
  cultivated_area_ha?: number | null;
  period?: string | null;
}

export interface ProductivityResponse {
  period: string | null;
  n_observations: number;
  kpis: { id: string; label: string; value: number | null; unit?: string | null; note?: string | null }[];
  rows: ProductivityRow[];
  provenance: Provenance;
}

// ---- Published period catalogue -------------------------------------------

/** How one dataset covers one published period, from `/meta/periods`. */
export interface PeriodDatasetCoverage {
  dataset: string;
  coverage_level: string;
  n_districts: number;
  n_crops: number;
  source_id?: string | null;
}

/** One published period, from `/meta/periods`. Never hard-code a period. */
export interface PeriodInfo {
  period_code: string;
  year: number;
  season: string;
  label: string;
  coverage_level: string | null;
  n_districts: number;
  n_crops: number;
  /** Which datasets carry this period. Drives honest layer availability. */
  datasets?: PeriodDatasetCoverage[];
  is_latest: boolean;
  is_latest_district: boolean;
}

/** One point of the canonical period-aware crop series (`/productivity/trend`). */
export interface PeriodTrendPoint {
  period_code: string;
  year: number;
  season: string;
  label: string;
  values: Record<string, number | null>;
}

/**
 * One crop across every published period, for a district or nationally.
 *
 * ``unit`` maps each metric to the unit it is published in, so a value is never
 * relabelled: the canonical district panel publishes ``yield_kg_ha`` (kg/ha).
 */
export interface PeriodTrendResponse {
  crop: string;
  district: string | null;
  geography_scope: string;
  unit: Record<string, string>;
  points: PeriodTrendPoint[];
  available_periods: string[];
  /** The same-season delta, computed by the service. */
  change?: SameSeasonChange | null;
  provenance: Provenance;
}

export interface PeriodsResponse {
  count: number;
  latest: string | null;
  latest_district: string | null;
  periods: PeriodInfo[];
  notes: string[];
}

/** One period of the canonical multi-period productivity panel. */
export interface PeriodProductivityResponse {
  period_code: string;
  label: string;
  defaulted_to_latest: boolean;
  filters: Record<string, string | number | null>;
  n_observations: number;
  n_districts: number;
  n_crops: number;
  available_periods: string[];
  rows: Record<string, string | number | null>[];
  provenance: Provenance;
}

export interface PostHarvestCrop {
  crop: string;
  sold_pct: number | null;
  own_consumption_pct: number | null;
  stored_pct: number | null;
  post_harvest_losses_pct: number | null;
  seeds_pct: number | null;
  fodder_pct: number | null;
  other_usage_pct: number | null;
  shares_sum_ok: boolean | null;
  risk_band: string | null;
}

export interface PostHarvestResponse {
  kpis: { id: string; label: string; value: number | null; unit?: string | null; period?: string | null; note?: string | null }[];
  crops: PostHarvestCrop[];
  provenance: Provenance;
}

export interface DistrictMetricRow {
  district: string;
  district_code?: string | null;
  province?: string | null;
  value: number | null;
  n_observations?: number;
  details?: {
    yield_kg_ha?: number | null;
    benchmark_yield_kg_ha?: number | null;
    gap_index?: number | null;
    input_adoption_pct?: number | null;
    priority_band?: string | null;
    priority_score?: number | null;
    period?: string | null;
    period_code?: string | null;
    reference_period?: string | null;
  };
}

export interface DistrictMetricsResponse {
  metric: string;
  metric_label: string;
  unit: string | null;
  period: string | null;
  period_code?: string | null;
  crop: string | null;
  min_value: number | null;
  max_value: number | null;
  districts: DistrictMetricRow[];
  /** True when the metric needs a crop selection (raw yield). */
  requires_crop?: boolean;
  /** Why the layer is empty, when it is (no crop, or a single-release layer). */
  message?: string | null;
  /** The release that does carry the metric when the selected period does not. */
  available_period?: string | null;
  /** Set when a period-specific metric also consumes a single-release component. */
  reference_period?: string | null;
  /**
   * Priority components with no measured value for the selected period. Their
   * weight is redistributed by the API instead of being scored as a constant.
   */
  components_unavailable?: string[];
  source_id?: string | null;
  provenance: Provenance;
}

// ---- Indexed yield ---------------------------------------------------------

/**
 * One crop indexed to its own published baseline.
 *
 * Raw yields are never averaged across crops; the Python service divides each
 * crop by its own baseline instead, and states the eligibility rules and
 * limitations with the result. ``index``/``value`` are null for a period the
 * release did not tabulate.
 */
export interface IndexedYieldPoint {
  period: string;
  label: string;
  value: number | null;
  index: number | null;
}

export interface IndexedYieldSeries {
  crop: string;
  eligible: boolean;
  availability: string;
  baseline: number | null;
  n_observations: number;
  reason: string | null;
  points: IndexedYieldPoint[];
}

export interface IndexedYieldResponse {
  metric: string;
  unit: string;
  baseline_definition: string;
  min_periods: number;
  periods: string[];
  series: IndexedYieldSeries[];
  provenance: Provenance;
}

// ---- Platform-computed change ----------------------------------------------

/**
 * A same-season delta computed by the Python service.
 *
 * Eligibility is part of the payload: when ``available`` is false, ``reason``
 * says why (the prior year is absent, published blank, or the baseline is
 * zero). A missing comparison is never rendered as a 0 % change.
 */
export interface SameSeasonChange {
  metric: string;
  unit: string | null;
  available: boolean;
  reason: string | null;
  period_code: string | null;
  period_label: string | null;
  previous_period_code: string | null;
  previous_period_label: string | null;
  current_value: number | null;
  previous_value: number | null;
  change_pct: number | null;
  change_abs: number | null;
}

// ---- National board --------------------------------------------------------

/**
 * One crop on the national board.
 *
 * ``series`` is aligned to ``NationalBoardResponse.periods``: position *i* of
 * every metric is the same period, and a null is a period the release did not
 * tabulate for this crop.
 */
export interface NationalBoardCrop {
  crop: string;
  coverage: string;
  n_published_periods: number;
  latest_published_period: string | null;
  latest_published_label: string | null;
  series: Record<string, (number | null)[]>;
  changes: Record<string, SameSeasonChange>;
}

/**
 * The all-crop national total, on the same period axis.
 *
 * Yield here is production over harvested area across the crops that published
 * both — never an average of per-crop yields.
 */
export interface NationalBoardTotals {
  series: Record<string, (number | null)[]>;
  changes: Record<string, SameSeasonChange>;
}

export interface NationalBoardResponse {
  metric_units: Record<string, string>;
  periods: string[];
  period_labels: Record<string, string>;
  crops: NationalBoardCrop[];
  national: NationalBoardTotals | null;
  provenance: Provenance;
}

// ---- Ask ------------------------------------------------------------------

export interface AskQuery {
  question: string;
  language?: string;
}

export interface KeyFigure {
  label: string;
  value: number;
  unit?: string | null;
}

export interface AskAnswer {
  answer: string;
  grounded: boolean;
  intent: string;
  evidence: Record<string, unknown>;
  key_figures: KeyFigure[];
  language: string;
  translation_status: string | null;
  source: string | null;
  period: string | null;
  coverage: string | null;
  limitations: string[];
}

export interface AskHistoryItem {
  id: string;
  question: string;
  answer: string;
  grounded: boolean;
  intent?: string | null;
  source: string | null;
  period: string | null;
  created_at: string;
}

// ---- Inquiry --------------------------------------------------------------

export interface InquiryInput {
  topic: string;
  crop?: string | null;
  province?: string | null;
  district?: string | null;
  message: string;
  contact_name?: string | null;
  contact_email?: string | null;
  organization?: string | null;
  client_uuid?: string | null;
}

export interface InquiryReceipt {
  id: string;
  receipt_token: string;
  status: "RECEIVED" | "REVIEWING" | "ANSWERED" | "CLOSED";
  created_at: string;
  reference: string;
}

export interface InquiryStatus {
  id: string;
  status: "RECEIVED" | "REVIEWING" | "ANSWERED" | "CLOSED";
  created_at: string;
  updated_at: string | null;
}

// ---- Saved ----------------------------------------------------------------

export interface SavedItem {
  id: string;
  type: "crop" | "district" | "question" | "indicator";
  entity_key: string;
  title: string;
  subtitle: string | null;
  metadata_json: string;
  created_at: string;
}

// ---- Settings -------------------------------------------------------------

export interface AppSettings {
  language: "en" | "rw";
  appearance: "system" | "light" | "dark";
  reducedMotion: boolean;
  largerText: boolean;
  offlineCacheEnabled: boolean;
  notificationsEnabled: boolean;
}

// ---- Sources --------------------------------------------------------------

export interface DataSource {
  source_id: string;
  name: string;
  description: string | null;
  coverage: string | null;
  period: string | null;
  last_update: string | null;
  url: string | null;
  limitations: string[] | null;
}
