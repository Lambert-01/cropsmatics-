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

export interface OutboxItem {
  clientUuid: string;
  entity: "harvest_registration" | "field_observation";
  operation: "create" | "update";
  payload: string;
  createdAt: string;
  attempts: number;
  status: SyncStatus;
}
