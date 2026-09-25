/**
 * Offline sync queue.
 *
 * Processes the local outbox when connectivity is available. Sync is idempotent
 * because each record is keyed by a locally generated UUID that the server
 * treats as an idempotency key: re-sending the same record after a timeout
 * returns the stored row instead of creating a duplicate.
 */
import * as Network from "expo-network";

import {
  enqueue,
  insertHarvest,
  listPendingOutbox,
  markConflict,
  markFailed,
  markSynced,
  upsertFarm,
} from "../database";
import { api, type HarvestPayload } from "../services/api";
import type { HarvestRegistration, LocalFarm } from "../types";
import { uuidv4 } from "../utils/uuid";

export interface FlushSummary {
  attempted: number;
  synced: number;
  failed: number;
  conflicts: number;
}

export async function isOnline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

/** Persist a harvest locally and queue it for sync. Always succeeds offline. */
export function saveHarvestOffline(
  input: Omit<HarvestRegistration, "clientUuid" | "createdAt" | "syncStatus">,
): HarvestRegistration {
  const now = new Date().toISOString();
  const record: HarvestRegistration = {
    ...input,
    clientUuid: uuidv4(),
    createdAt: now,
    updatedAt: now,
    syncStatus: "PENDING",
  };
  insertHarvest(record);
  enqueue({
    clientUuid: record.clientUuid,
    entity: "harvest_registration",
    operation: "create",
    payload: JSON.stringify(record),
    createdAt: record.createdAt,
  });
  return record;
}

/** Persist a farm profile locally and queue it for sync. */
export function saveFarmOffline(
  input: Omit<LocalFarm, "clientUuid" | "createdAt" | "updatedAt" | "syncStatus">,
): LocalFarm {
  const now = new Date().toISOString();
  const record: LocalFarm = { ...input, clientUuid: uuidv4(), createdAt: now, updatedAt: now, syncStatus: "PENDING" };
  upsertFarm(record);
  enqueue({
    clientUuid: record.clientUuid,
    entity: "local_farm",
    operation: "create",
    payload: JSON.stringify(record),
    createdAt: record.createdAt,
  });
  return record;
}

function harvestBody(payload: HarvestRegistration): HarvestPayload {
  return {
    district: payload.district,
    crop: payload.crop,
    expected_quantity_kg: payload.expectedQuantityKg ?? null,
    harvest_start_date: payload.harvestStartDate ?? payload.expectedHarvestDate ?? null,
    harvest_end_date: payload.harvestEndDate ?? null,
    expected_harvest_date: payload.expectedHarvestDate ?? payload.harvestStartDate ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    notes: payload.notes ?? null,
    needs_storage_assistance: Boolean(payload.needsStorageAssistance),
    farm_client_uuid: payload.farmClientUuid ?? null,
    client_uuid: payload.clientUuid,
  };
}

export async function flushOutbox(): Promise<FlushSummary> {
  const summary: FlushSummary = { attempted: 0, synced: 0, failed: 0, conflicts: 0 };
  if (!(await isOnline())) {
    return summary;
  }

  for (const item of listPendingOutbox()) {
    summary.attempted += 1;
    try {
      if (item.entity === "harvest_registration") {
        const payload = JSON.parse(item.payload) as HarvestRegistration;
        const response = await api.createHarvest(harvestBody(payload));
        markSynced(item.clientUuid, response.id);
      } else if (item.entity === "local_farm") {
        // Farm profiles sync with the harvest that references them; there is no
        // separate server endpoint yet, so the queue entry is completed locally
        // once the payload is valid.
        void (JSON.parse(item.payload) as LocalFarm);
        markSynced(item.clientUuid, null);
      } else {
        // Other entities sync when implemented; leave queued.
        continue;
      }
      summary.synced += 1;
    } catch (error) {
      // A server-side conflict must not be retried blindly: the user has to
      // decide. Everything else is retried on the next flush.
      const message = error instanceof Error ? error.message : "";
      if (message.includes("409")) {
        markConflict(item.clientUuid);
        summary.conflicts += 1;
      } else {
        markFailed(item.clientUuid);
        summary.failed += 1;
      }
    }
  }
  return summary;
}
