export type SyncStatus = "PENDING" | "SYNCED" | "CONFLICT" | "FAILED";

/** Canonical storage unit. The API always receives kilograms. */
export type QuantityUnit = "kg" | "tonnes";

export interface LocalFarm {
  /** Locally generated UUID; the idempotency key on sync. */
  clientUuid: string;
  name: string;
  district: string;
  sector?: string | null;
  farmSizeHa?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface HarvestRegistration {
  /** Locally generated UUID; becomes the idempotency key on sync. */
  clientUuid: string;
  serverId?: string | null;
  farmClientUuid?: string | null;
  district: string;
  crop: string;
  expectedQuantityKg?: number | null;
  harvestStartDate?: string | null;
  harvestEndDate?: string | null;
  /** Legacy single-date field kept so old local rows still render. */
  expectedHarvestDate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  needsStorageAssistance?: boolean;
  actualQuantityKg?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  syncStatus: SyncStatus;
}

/** Locally persisted server risk result (never computed on the device). */
export interface HarvestRisk {
  id: number;
  harvestClientUuid: string;
  riskProbability: number;
  riskBand: "LOW" | "MODERATE" | "HIGH";
  factorsJson: string;
  actionsJson: string;
  modelVersion?: string | null;
  calculatedAt: string;
  syncStatus: SyncStatus;
}

export interface HarvestAttachment {
  clientUuid: string;
  harvestClientUuid: string;
  localUri: string;
  mimeType?: string | null;
  fileName: string;
  sizeBytes?: number | null;
  createdAt: string;
  syncStatus: SyncStatus;
  serverUrl?: string | null;
}

/** Structured risk contribution returned by POST /risk/post-harvest. */
export interface RiskFactor {
  factor: string;
  factor_value?: string | null;
  impact: number;
  reason: string;
}

export interface RiskAction {
  action: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface RiskResult {
  probability: number;
  band: "LOW" | "MODERATE" | "HIGH";
  contributingFactors: string[];
  recommendedActions: string[];
}

/** Response from the stateless POST /risk/post-harvest endpoint (snake_case). */
export interface PostHarvestRisk {
  probability: number;
  band: "LOW" | "MODERATE" | "HIGH";
  /** A rule-based score, not a calibrated model probability. */
  score_label?: string;
  model_version?: string | null;
  factors?: RiskFactor[];
  actions?: RiskAction[];
  contributing_factors: string[];
  recommended_actions: string[];
  capacity_context: string;
  provenance?: {
    model_version?: string | null;
    method?: string | null;
    limitations?: string[];
  };
}

export interface FacilityContext {
  district: string;
  initiative?: string | null;
  capacity_kg?: number | null;
  capacity_status: string;
}

/** National MINAGRI post-harvest infrastructure row (national level only). */
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

export interface ColdChainProgram {
  indicators: { indicator?: string | null; value?: number | null; unit?: string | null; notes?: string | null }[];
  program_districts: string[];
  facility_capacity: null;
  facility_capacity_status: string;
  facility_location_status: string;
  note?: string | null;
}

export interface StorageInfrastructure {
  level_of_analysis: string;
  label: string;
  items: InfrastructureItem[];
  totals?: {
    existing_number?: number | null;
    existing_capacity_mt?: number | null;
    new_number?: number | null;
    new_capacity_mt?: number | null;
    total_number?: number | null;
    total_capacity_mt?: number | null;
    capacity_unit: string;
    period?: string | null;
  } | null;
  program: ColdChainProgram;
  provenance?: { limitations?: string[] };
}

export interface FacilityContextResponse {
  district_in_program?: boolean | null;
  program_districts: string[];
  capacity: null;
  capacity_status: string;
  note?: string;
}

export interface OutboxItem {
  clientUuid: string;
  entity: "harvest_registration" | "local_farm" | "field_observation";
  operation: "create" | "update";
  payload: string;
  createdAt: string;
  attempts: number;
  status: SyncStatus;
}
