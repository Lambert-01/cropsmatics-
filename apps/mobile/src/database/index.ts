/**
 * Offline-first local database (Expo SQLite).
 *
 * Flow: user creates data -> local SQLite -> local UUID -> sync queue
 *       -> connectivity detected -> idempotent API sync -> server id stored.
 *
 * The schema is intentionally small; add tables as features land.
 */
import * as SQLite from "expo-sqlite";

import type { HarvestRegistration, OutboxItem } from "../types";

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("cropmatics.db");
    migrate(db);
  }
  return db;
}

function migrate(database: SQLite.SQLiteDatabase): void {
  database.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS harvest_registration (
      client_uuid TEXT PRIMARY KEY NOT NULL,
      server_id TEXT,
      district TEXT NOT NULL,
      crop TEXT NOT NULL,
      expected_harvest_date TEXT,
      expected_quantity_kg REAL,
      actual_quantity_kg REAL,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS outbox (
      client_uuid TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING'
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status);
  `);
}

// ---- harvest registrations ------------------------------------------------
export function insertHarvest(record: HarvestRegistration): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO harvest_registration
      (client_uuid, server_id, district, crop, expected_harvest_date,
       expected_quantity_kg, actual_quantity_kg, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.clientUuid,
    record.serverId ?? null,
    record.district,
    record.crop,
    record.expectedHarvestDate ?? null,
    record.expectedQuantityKg ?? null,
    record.actualQuantityKg ?? null,
    record.createdAt,
    record.syncStatus,
  );
}

export function listHarvests(): HarvestRegistration[] {
  return getDb()
    .getAllSync<HarvestRegistration>(
      `SELECT client_uuid AS clientUuid, server_id AS serverId, district, crop,
              expected_harvest_date AS expectedHarvestDate,
              expected_quantity_kg AS expectedQuantityKg,
              actual_quantity_kg AS actualQuantityKg,
              created_at AS createdAt, sync_status AS syncStatus
       FROM harvest_registration ORDER BY created_at DESC`,
    )
    .map((r) => ({ ...r, syncStatus: r.syncStatus as HarvestRegistration["syncStatus"] }));
}

// ---- outbox / sync queue --------------------------------------------------
export function enqueue(item: Omit<OutboxItem, "attempts" | "status">): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO outbox (client_uuid, entity, operation, payload, created_at, attempts, status)
     VALUES (?, ?, ?, ?, ?, 0, 'PENDING')`,
    item.clientUuid,
    item.entity,
    item.operation,
    item.payload,
    item.createdAt,
  );
}

export function listPendingOutbox(): OutboxItem[] {
  return getDb().getAllSync<OutboxItem>(
    `SELECT client_uuid AS clientUuid, entity, operation, payload, created_at AS createdAt,
            attempts, status
     FROM outbox WHERE status IN ('PENDING', 'FAILED') ORDER BY created_at ASC`,
  );
}

export function markSynced(clientUuid: string, serverId: string | null): void {
  const database = getDb();
  database.runSync("UPDATE outbox SET status = 'SYNCED' WHERE client_uuid = ?", clientUuid);
  database.runSync(
    "UPDATE harvest_registration SET sync_status = 'SYNCED', server_id = ? WHERE client_uuid = ?",
    serverId,
    clientUuid,
  );
}

export function markFailed(clientUuid: string): void {
  getDb().runSync(
    "UPDATE outbox SET status = 'FAILED', attempts = attempts + 1 WHERE client_uuid = ?",
    clientUuid,
  );
}
