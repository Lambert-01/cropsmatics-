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

export interface ProductivityRow {
  year: number;
  season: string;
  district: string;
  crop: string;
  yield_kg_ha?: number | null;
  benchmark_yield_kg_ha?: number | null;
  gap_index?: number | null;
}

export interface GapResponse {
  strategy: string;
  count: number;
  rows: ProductivityRow[];
  provenance: Provenance;
}

export interface PriorityRow {
  id: string;
  district: string;
  crop: string;
  score: number;
  band: string;
  gap: number;
}

export interface PriorityResponse {
  weights: Record<string, number>;
  rows: PriorityRow[];
  provenance: Provenance;
}
