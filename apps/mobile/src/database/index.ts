/**
 * Offline-first local database (Expo SQLite).
 *
 * Flow: user creates data -> local SQLite -> local UUID -> sync queue
 *       -> connectivity detected -> idempotent API sync -> server id stored.
 *
 * Migrations are additive only (see `schema.ts`). A farmer's phone may hold
 * unsynced records for weeks, so a schema change must never delete local data.
 */
import * as SQLite from "expo-sqlite";

import type {
  AskHistoryItem,
  HarvestAttachment,
  HarvestRegistration,
  HarvestRisk,
  InquiryReceipt,
  LocalFarm,
  OutboxItem,
  SavedItem,
} from "../types";
import {
  ASK_HISTORY_SELECT,
  ATTACHMENT_SELECT,
  CREATE_INDEXES,
  CREATE_META,
  CREATE_TABLES,
  FARM_SELECT,
  HARVEST_ADDED_COLUMNS,
  HARVEST_SELECT,
  INQUIRY_RECEIPT_SELECT,
  RISK_SELECT,
  SAVED_SELECT,
  SCHEMA_VERSION,
} from "./schema";

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("cropmatics.db");
    migrate(db);
  }
  return db;
}

/** Close the handle (used by tests and when the app is torn down). */
export function closeDb(): void {
  db?.closeSync();
  db = null;
}

/**
 * Add any missing columns without touching existing rows.
 *
 * `ALTER TABLE ... ADD COLUMN` is the only safe option here: SQLite cannot add a
 * NOT NULL column without a default, and recreating the table would risk the
 * rows we are specifically trying to preserve.
 */
function ensureColumns(
  database: SQLite.SQLiteDatabase,
  table: string,
  columns: Readonly<Record<string, string>>,
): string[] {
  const existing = new Set(
    database.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name),
  );
  const added: string[] = [];
  for (const [name, ddl] of Object.entries(columns)) {
    if (!existing.has(name)) {
      database.execSync(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
      added.push(name);
    }
  }
  return added;
}

export function migrate(database: SQLite.SQLiteDatabase): { addedColumns: string[] } {
  database.execSync("PRAGMA journal_mode = WAL;");
  database.execSync("PRAGMA foreign_keys = ON;");
  for (const statement of CREATE_TABLES) database.execSync(statement);
  const addedColumns = ensureColumns(database, "harvest_registration", HARVEST_ADDED_COLUMNS);
  for (const statement of CREATE_INDEXES) database.execSync(statement);
  database.execSync(CREATE_META);
  database.runSync(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)",
    String(SCHEMA_VERSION),
  );
  return { addedColumns };
}

export function schemaVersion(): number {
  const row = getDb().getFirstSync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'schema_version'",
  );
  return row ? Number(row.value) : 0;
}

type HarvestRow = Omit<HarvestRegistration, "needsStorageAssistance"> & {
  needsStorageAssistance: number | null;
};

function toHarvest(row: HarvestRow): HarvestRegistration {
  return {
    ...row,
    needsStorageAssistance: Boolean(row.needsStorageAssistance),
    syncStatus: row.syncStatus as HarvestRegistration["syncStatus"],
  };
}

// ---- harvest registrations ------------------------------------------------
export function insertHarvest(record: HarvestRegistration): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO harvest_registration
      (client_uuid, server_id, farm_client_uuid, district, crop,
       expected_quantity_kg, harvest_start_date, harvest_end_date,
       expected_harvest_date, latitude, longitude, notes,
       needs_storage_assistance, actual_quantity_kg, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.clientUuid,
    record.serverId ?? null,
    record.farmClientUuid ?? null,
    record.district,
    record.crop,
    record.expectedQuantityKg ?? null,
    record.harvestStartDate ?? null,
    record.harvestEndDate ?? null,
    record.expectedHarvestDate ?? record.harvestStartDate ?? null,
    record.latitude ?? null,
    record.longitude ?? null,
    record.notes ?? null,
    record.needsStorageAssistance ? 1 : 0,
    record.actualQuantityKg ?? null,
    record.createdAt,
    record.updatedAt ?? record.createdAt,
    record.syncStatus,
  );
}

export function listHarvests(): HarvestRegistration[] {
  return getDb()
    .getAllSync<HarvestRow>(`${HARVEST_SELECT} ORDER BY created_at DESC`)
    .map(toHarvest);
}

export function getHarvest(clientUuid: string): HarvestRegistration | null {
  const row = getDb().getFirstSync<HarvestRow>(`${HARVEST_SELECT} WHERE client_uuid = ?`, clientUuid);
  return row ? toHarvest(row) : null;
}

// ---- local farm profiles --------------------------------------------------
export function upsertFarm(farm: LocalFarm): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO local_farm
      (client_uuid, name, district, sector, farm_size_ha, latitude, longitude,
       created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    farm.clientUuid,
    farm.name,
    farm.district,
    farm.sector ?? null,
    farm.farmSizeHa ?? null,
    farm.latitude ?? null,
    farm.longitude ?? null,
    farm.createdAt,
    farm.updatedAt,
    farm.syncStatus,
  );
}

export function listFarms(): LocalFarm[] {
  return getDb()
    .getAllSync<LocalFarm & { syncStatus: string }>(`${FARM_SELECT} ORDER BY created_at DESC`)
    .map((row) => ({ ...row, syncStatus: row.syncStatus as LocalFarm["syncStatus"] }));
}

export function getFarm(clientUuid: string): LocalFarm | null {
  const row = getDb().getFirstSync<LocalFarm & { syncStatus: string }>(
    `${FARM_SELECT} WHERE client_uuid = ?`,
    clientUuid,
  );
  return row ? { ...row, syncStatus: row.syncStatus as LocalFarm["syncStatus"] } : null;
}

// ---- risk results ---------------------------------------------------------
export function saveRisk(risk: Omit<HarvestRisk, "id">): void {
  getDb().runSync(
    `INSERT INTO harvest_risk
      (harvest_client_uuid, risk_probability, risk_band, factors_json, actions_json,
       model_version, calculated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    risk.harvestClientUuid,
    risk.riskProbability,
    risk.riskBand,
    risk.factorsJson,
    risk.actionsJson,
    risk.modelVersion ?? null,
    risk.calculatedAt,
    risk.syncStatus,
  );
}

export function latestRiskFor(harvestClientUuid: string): HarvestRisk | null {
  const row = getDb().getFirstSync<HarvestRisk & { syncStatus: string }>(
    `${RISK_SELECT} WHERE harvest_client_uuid = ? ORDER BY calculated_at DESC, id DESC LIMIT 1`,
    harvestClientUuid,
  );
  return row ? { ...row, syncStatus: row.syncStatus as HarvestRisk["syncStatus"] } : null;
}

export function listRisks(limit = 50): HarvestRisk[] {
  return getDb()
    .getAllSync<HarvestRisk & { syncStatus: string }>(
      `${RISK_SELECT} ORDER BY calculated_at DESC, id DESC LIMIT ?`,
      limit,
    )
    .map((row) => ({ ...row, syncStatus: row.syncStatus as HarvestRisk["syncStatus"] }));
}

// ---- attachments ----------------------------------------------------------
export function insertAttachment(attachment: HarvestAttachment): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO harvest_attachment
      (client_uuid, harvest_client_uuid, local_uri, mime_type, file_name,
       size_bytes, created_at, sync_status, server_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    attachment.clientUuid,
    attachment.harvestClientUuid,
    attachment.localUri,
    attachment.mimeType ?? null,
    attachment.fileName,
    attachment.sizeBytes ?? null,
    attachment.createdAt,
    attachment.syncStatus,
    attachment.serverUrl ?? null,
  );
}

export function listAttachments(harvestClientUuid: string): HarvestAttachment[] {
  return getDb().getAllSync<HarvestAttachment & { syncStatus: string }>(
    `${ATTACHMENT_SELECT} WHERE harvest_client_uuid = ? ORDER BY created_at ASC`,
    harvestClientUuid,
  );
}

export function deleteAttachment(clientUuid: string): void {
  getDb().runSync("DELETE FROM harvest_attachment WHERE client_uuid = ?", clientUuid);
}

// ---- saved intelligence items ---------------------------------------------
function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function saveItem(input: {
  type: SavedItem["type"];
  entityKey: string;
  title: string;
  subtitle?: string | null;
  metadata?: Record<string, unknown>;
}): SavedItem {
  const id = randomId();
  getDb().runSync(
    `INSERT INTO saved_item (id, type, entity_key, title, subtitle, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(type, entity_key) DO UPDATE SET title = excluded.title,
       subtitle = excluded.subtitle, metadata_json = excluded.metadata_json`,
    id,
    input.type,
    input.entityKey,
    input.title,
    input.subtitle ?? null,
    JSON.stringify(input.metadata ?? {}),
    new Date().toISOString(),
  );
  return getSavedItem(input.type, input.entityKey) as SavedItem;
}

export function listSaved(type?: SavedItem["type"]): SavedItem[] {
  const db = getDb();
  const rows = type
    ? db.getAllSync<SavedItem>(`${SAVED_SELECT} WHERE type = ? ORDER BY created_at DESC`, type)
    : db.getAllSync<SavedItem>(`${SAVED_SELECT} ORDER BY created_at DESC`);
  return rows;
}

export function getSavedItem(type: SavedItem["type"], entityKey: string): SavedItem | null {
  const row = getDb().getFirstSync<SavedItem>(
    `${SAVED_SELECT} WHERE type = ? AND entity_key = ?`,
    type,
    entityKey,
  );
  return row ?? null;
}

export function removeSavedItem(type: SavedItem["type"], entityKey: string): void {
  getDb().runSync("DELETE FROM saved_item WHERE type = ? AND entity_key = ?", type, entityKey);
}

export function clearSavedItems(): void {
  getDb().runSync("DELETE FROM saved_item");
}

// ---- grounded Ask history -------------------------------------------------
export function addAskHistory(item: Omit<AskHistoryItem, "id" | "created_at">): AskHistoryItem {
  const record: AskHistoryItem = {
    ...item,
    id: randomId(),
    created_at: new Date().toISOString(),
  };
  getDb().runSync(
    `INSERT INTO ask_history (id, question, answer, grounded, intent, source, period, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.question,
    record.answer,
    record.grounded ? 1 : 0,
    record.intent ?? null,
    record.source ?? null,
    record.period ?? null,
    record.created_at,
  );
  return record;
}

export function listAskHistory(limit = 50): AskHistoryItem[] {
  type Row = Omit<AskHistoryItem, "grounded"> & { grounded: number };
  return getDb()
    .getAllSync<Row>(`${ASK_HISTORY_SELECT} ORDER BY created_at DESC LIMIT ?`, limit)
    .map((row) => ({ ...row, grounded: Boolean(row.grounded) }));
}

export function clearAskHistory(): void {
  getDb().runSync("DELETE FROM ask_history");
}

// ---- inquiry receipts (private status tracking) ---------------------------
export function saveInquiryReceipt(receipt: InquiryReceipt & { reference: string }): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO inquiry_receipt (id, receipt_token, reference, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    receipt.id,
    receipt.receipt_token,
    receipt.reference,
    receipt.status,
    receipt.created_at,
  );
}

export function listInquiryReceipts(): InquiryReceipt[] {
  return getDb().getAllSync<InquiryReceipt>(`${INQUIRY_RECEIPT_SELECT} ORDER BY created_at DESC`);
}

export function updateInquiryReceiptStatus(id: string, status: string): void {
  getDb().runSync("UPDATE inquiry_receipt SET status = ? WHERE id = ?", status, id);
}

// ---- inquiry offline drafts ----------------------------------------------
export function saveInquiryDraft(clientUuid: string, payload: Record<string, unknown>): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO inquiry_draft (client_uuid, payload, created_at) VALUES (?, ?, ?)`,
    clientUuid,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

export function listInquiryDrafts(): { clientUuid: string; payload: string; createdAt: string }[] {
  return getDb().getAllSync<{ clientUuid: string; payload: string; createdAt: string }>(
    "SELECT client_uuid AS clientUuid, payload, created_at AS createdAt FROM inquiry_draft ORDER BY created_at ASC",
  );
}

export function removeInquiryDraft(clientUuid: string): void {
  getDb().runSync("DELETE FROM inquiry_draft WHERE client_uuid = ?", clientUuid);
}

// ---- offline cache maintenance -------------------------------------------
export function clearCachedData(): void {
  // Ask history and saved items are user data and are deliberately preserved.
  // Only the inquiry draft queue is cleared here; server cache lives in
  // AsyncStorage and is cleared by the settings screen directly.
  getDb().runSync("DELETE FROM inquiry_draft");
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

export function countPendingOutbox(): number {
  const row = getDb().getFirstSync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM outbox WHERE status IN ('PENDING', 'FAILED')",
  );
  return row?.n ?? 0;
}

export function markSynced(
  clientUuid: string,
  serverId: string | null,
  entity?: OutboxItem["entity"],
): void {
  const database = getDb();
  database.withTransactionSync(() => {
    database.runSync("UPDATE outbox SET status = 'SYNCED' WHERE client_uuid = ?", clientUuid);
    if (entity === "local_farm") {
      database.runSync(
        "UPDATE local_farm SET sync_status = 'SYNCED' WHERE client_uuid = ?",
        clientUuid,
      );
    } else if (entity === "harvest_registration") {
      database.runSync(
        "UPDATE harvest_registration SET sync_status = 'SYNCED', server_id = ? WHERE client_uuid = ?",
        serverId,
        clientUuid,
      );
    } else {
      // Backwards-compatible recovery for an older queued item whose entity is
      // not present in its persisted outbox row.
      database.runSync(
        "UPDATE local_farm SET sync_status = 'SYNCED' WHERE client_uuid = ?",
        clientUuid,
      );
      database.runSync(
        "UPDATE harvest_registration SET sync_status = 'SYNCED', server_id = ? WHERE client_uuid = ?",
        serverId,
        clientUuid,
      );
    }
  });
}

export function markFailed(clientUuid: string, entity?: OutboxItem["entity"]): void {
  const database = getDb();
  database.withTransactionSync(() => {
    database.runSync(
      "UPDATE outbox SET status = 'FAILED', attempts = attempts + 1 WHERE client_uuid = ?",
      clientUuid,
    );
    if (entity === "local_farm") {
      database.runSync("UPDATE local_farm SET sync_status = 'FAILED' WHERE client_uuid = ?", clientUuid);
    } else if (entity === "harvest_registration") {
      database.runSync("UPDATE harvest_registration SET sync_status = 'FAILED' WHERE client_uuid = ?", clientUuid);
    }
  });
}

/** Conflict is recorded rather than resolved silently (see docs/17_DEPLOYMENT.md). */
export function markConflict(clientUuid: string, entity?: OutboxItem["entity"]): void {
  const database = getDb();
  database.withTransactionSync(() => {
    database.runSync("UPDATE outbox SET status = 'CONFLICT' WHERE client_uuid = ?", clientUuid);
    if (entity === "local_farm") {
      database.runSync("UPDATE local_farm SET sync_status = 'CONFLICT' WHERE client_uuid = ?", clientUuid);
    } else if (entity === "harvest_registration") {
      database.runSync("UPDATE harvest_registration SET sync_status = 'CONFLICT' WHERE client_uuid = ?", clientUuid);
    }
  });
}
