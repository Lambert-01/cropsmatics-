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
  };
}

export interface DistrictMetricsResponse {
  metric: string;
  metric_label: string;
  unit: string | null;
  period: string | null;
  crop: string | null;
  min_value: number | null;
  max_value: number | null;
  districts: DistrictMetricRow[];
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
