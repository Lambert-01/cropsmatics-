import type { OutboxItem } from "../types";
import { getDb } from "./index";

/**
 * Conflicts are deliberately excluded from the retry queue: retrying a 409
 * blindly can overwrite a decision the user needs to review. They still need a
 * read path of their own so Alerts, Sync and the header badge can surface them.
 */
export function listConflictOutbox(): OutboxItem[] {
  return getDb().getAllSync<OutboxItem>(
    `SELECT client_uuid AS clientUuid, entity, operation, payload, created_at AS createdAt,
            attempts, status
     FROM outbox WHERE status = 'CONFLICT' ORDER BY created_at ASC`,
  );
}
