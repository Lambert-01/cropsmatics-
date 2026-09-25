/**
 * Offline sync queue.
 *
 * Processes the local outbox when connectivity is available. Sync is idempotent
 * because each record is keyed by a locally generated UUID that the server
 * treats as an idempotency key.
 */
import * as Network from "expo-network";

import { enqueue, insertHarvest, listPendingOutbox, markFailed, markSynced } from "../database";
import { api, type HarvestPayload } from "../services/api";
import type { HarvestRegistration } from "../types";
import { uuidv4 } from "../utils/uuid";

export interface FlushSummary {
  attempted: number;
  synced: number;
  failed: number;
}

export async function isOnline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

/** Persist a harvest locally and queue it for sync. Always succeeds offline. */
export function saveHarvestOffline(
  input: Omit<HarvestRegistration, "clientUuid" | "createdAt" | "syncStatus">,
): HarvestRegistration {
  const record: HarvestRegistration = {
    ...input,
    clientUuid: uuidv4(),
    createdAt: new Date().toISOString(),
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

export async function flushOutbox(): Promise<FlushSummary> {
  const summary: FlushSummary = { attempted: 0, synced: 0, failed: 0 };
  if (!(await isOnline())) {
    return summary;
  }

  for (const item of listPendingOutbox()) {
    summary.attempted += 1;
    try {
      if (item.entity === "harvest_registration") {
        const payload = JSON.parse(item.payload) as HarvestRegistration;
        const body: HarvestPayload = {
          district: payload.district,
          crop: payload.crop,
          expected_harvest_date: payload.expectedHarvestDate ?? null,
          expected_quantity_kg: payload.expectedQuantityKg ?? null,
          client_uuid: payload.clientUuid,
        };
        const response = await api.createHarvest(body);
        markSynced(item.clientUuid, response.id);
      } else {
        // Other entities sync when implemented; leave queued.
        continue;
      }
      summary.synced += 1;
    } catch {
      markFailed(item.clientUuid);
      summary.failed += 1;
    }
  }
  return summary;
}
