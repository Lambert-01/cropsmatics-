export type SyncStatus = "PENDING" | "SYNCED" | "CONFLICT" | "FAILED";

export interface HarvestRegistration {
  /** Locally generated UUID; becomes the idempotency key on sync. */
  clientUuid: string;
  serverId?: string | null;
  district: string;
  crop: string;
  expectedHarvestDate?: string | null;
  expectedQuantityKg?: number | null;
  actualQuantityKg?: number | null;
  createdAt: string;
  syncStatus: SyncStatus;
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

export interface OutboxItem {
  clientUuid: string;
  entity: "harvest_registration" | "field_observation";
  operation: "create" | "update";
  payload: string;
  createdAt: string;
  attempts: number;
  status: SyncStatus;
}
