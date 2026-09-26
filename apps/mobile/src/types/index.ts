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

// ---- Intelligence platform types ----------------------------------------

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

export interface HomeData {
  latest_period: string | null;
  crop_count: number;
  district_count: number;
  indicator_count: number;
  source_count: number;
  popular_questions: string[];
  data_version: string | null;
}

export interface AskQuery {
  question: string;
  language?: string;
}

export interface AskAnswer {
  answer: string;
  grounded: boolean;
  evidence: Record<string, unknown>;
  limitations: string[];
}

export interface AskHistoryItem {
  id: string;
  question: string;
  answer: string;
  grounded: boolean;
  source_period: string | null;
  created_at: string;
}

export interface InquiryInput {
  topic: string;
  crop?: string | null;
  province?: string | null;
  district?: string | null;
  message: string;
  contact_name?: string | null;
  contact_email?: string | null;
  organization?: string | null;
}

export interface InquiryRecord extends InquiryInput {
  id: string;
  status: "RECEIVED" | "REVIEWING" | "ANSWERED" | "CLOSED";
  created_at: string;
}

export interface SavedItem {
  id: string;
  type: "crop" | "district" | "question" | "indicator";
  entity_key: string;
  title: string;
  metadata_json: string;
  created_at: string;
}

export interface AppSettings {
  language: "en" | "rw";
  appearance: "system" | "light" | "dark";
  reducedMotion: boolean;
  largerText: boolean;
  offlineCacheEnabled: boolean;
  notificationsEnabled: boolean;
}
