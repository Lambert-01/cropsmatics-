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
import { api, type FarmPayload, type HarvestPayload } from "../services/api";
import type { HarvestRegistration, LocalFarm } from "../types";
import { uuidv4 } from "../utils/uuid";

export interface FlushSummary {
  attempted: number;
  synced: number;
  failed: number;
  conflicts: number;
}

let activeFlush: Promise<FlushSummary> | null = null;

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

function farmBody(payload: LocalFarm): FarmPayload {
  return {
    client_uuid: payload.clientUuid,
    name: payload.name,
    district: payload.district,
    sector: payload.sector ?? null,
    farm_size_ha: payload.farmSizeHa ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
  };
}

async function flushOutboxOnce(): Promise<FlushSummary> {
  const summary: FlushSummary = { attempted: 0, synced: 0, failed: 0, conflicts: 0 };
  if (!(await isOnline())) {
    return summary;
  }

  for (const item of listPendingOutbox()) {
    summary.attempted += 1;
    try {
      if (item.entity === "harvest_registration") {
        const payload = JSON.parse(item.payload) as HarvestRegistration;
        // Upload first: markSynced runs only once the server has acknowledged
        // the record, so a dropped connection leaves the entry queued.
        const response = await api.createHarvest(harvestBody(payload));
        markSynced(item.clientUuid, response.id, item.entity);
      } else if (item.entity === "local_farm") {
        // The farm profile syncs through the same idempotent-on-client_uuid
        // upload as a harvest; the server links any harvest registrations that
        // referenced this farm before it existed there.
        const payload = JSON.parse(item.payload) as LocalFarm;
        const response = await api.createFarm(farmBody(payload));
        markSynced(item.clientUuid, response.id, item.entity);
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
        markConflict(item.clientUuid, item.entity);
        summary.conflicts += 1;
      } else {
        markFailed(item.clientUuid, item.entity);
        summary.failed += 1;
      }
    }
  }
  return summary;
}

/** Prevent a manual refresh and a reconnect listener from flushing the same
 * rows concurrently. Both callers receive the same completion summary. */
export function flushOutbox(): Promise<FlushSummary> {
  if (activeFlush) return activeFlush;
  const run = flushOutboxOnce();
  let tracked: Promise<FlushSummary>;
  tracked = run.finally(() => {
    if (activeFlush === tracked) activeFlush = null;
  });
  activeFlush = tracked;
  return tracked;
}
