/**
 * SQLite schema definition.
 *
 * Migrations are **additive only**. Local data is created offline and may exist
 * on a farmer's phone for months, so a schema change must never drop a table or
 * a column. New fields are optional or defaulted, which also means a row written
 * by an older app version still loads correctly.
 *
 * The SQL lives here as data (rather than inline strings in the migration code)
 * so it can be asserted in unit tests without a native SQLite runtime.
 */

/** Tables created with `CREATE TABLE IF NOT EXISTS`. */
export const CREATE_TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS harvest_registration (
    client_uuid TEXT PRIMARY KEY NOT NULL,
    server_id TEXT,
    district TEXT NOT NULL,
    crop TEXT NOT NULL,
    expected_harvest_date TEXT,
    expected_quantity_kg REAL,
    actual_quantity_kg REAL,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING'
  )`,

  `CREATE TABLE IF NOT EXISTS outbox (
    client_uuid TEXT PRIMARY KEY NOT NULL,
    entity TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING'
  )`,

  // --- local farm profiles ------------------------------------------------
  // A "Farm" is a real place with a name, not just a district selector.
  `CREATE TABLE IF NOT EXISTS local_farm (
    client_uuid TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    sector TEXT,
    farm_size_ha REAL,
    latitude REAL,
    longitude REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING'
  )`,

  // --- risk results -------------------------------------------------------
  // Persisted server results. The device never computes risk, it only stores
  // what the API returned so Home/Harvests/Insights can show real history.
  `CREATE TABLE IF NOT EXISTS harvest_risk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    harvest_client_uuid TEXT NOT NULL,
    risk_probability REAL NOT NULL,
    risk_band TEXT NOT NULL,
    factors_json TEXT NOT NULL DEFAULT '[]',
    actions_json TEXT NOT NULL DEFAULT '[]',
    model_version TEXT,
    calculated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'SYNCED'
  )`,

  // --- attachments --------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS harvest_attachment (
    client_uuid TEXT PRIMARY KEY NOT NULL,
    harvest_client_uuid TEXT NOT NULL,
    local_uri TEXT NOT NULL,
    mime_type TEXT,
    file_name TEXT NOT NULL,
    size_bytes INTEGER,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING',
    server_url TEXT
  )`,
];

/** Indexes, created after the tables. */
export const CREATE_INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status)`,
  `CREATE INDEX IF NOT EXISTS idx_harvest_sync_status ON harvest_registration (sync_status)`,
  `CREATE INDEX IF NOT EXISTS idx_risk_harvest ON harvest_risk (harvest_client_uuid)`,
  `CREATE INDEX IF NOT EXISTS idx_attachment_harvest ON harvest_attachment (harvest_client_uuid)`,
];

/**
 * Columns added to `harvest_registration` after the first release.
 *
 * Every column is nullable or has a DEFAULT, so existing rows keep working and
 * the `INSERT` used by older clients is still valid.
 */
export const HARVEST_ADDED_COLUMNS: Readonly<Record<string, string>> = {
  farm_client_uuid: "TEXT",
  harvest_start_date: "TEXT",
  harvest_end_date: "TEXT",
  latitude: "REAL",
  longitude: "REAL",
  notes: "TEXT",
  needs_storage_assistance: "INTEGER NOT NULL DEFAULT 0",
  updated_at: "TEXT",
};

/** Recorded so a device can report which schema generation it is on. */
export const SCHEMA_VERSION = 2;

export const CREATE_META = `CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
)`;

/** Columns returned for a harvest, in camelCase, matching the TS interface. */
export const HARVEST_SELECT = `
  SELECT client_uuid AS clientUuid,
         server_id AS serverId,
         farm_client_uuid AS farmClientUuid,
         district,
         crop,
         expected_quantity_kg AS expectedQuantityKg,
         harvest_start_date AS harvestStartDate,
         harvest_end_date AS harvestEndDate,
         expected_harvest_date AS expectedHarvestDate,
         latitude,
         longitude,
         notes,
         needs_storage_assistance AS needsStorageAssistance,
         actual_quantity_kg AS actualQuantityKg,
         created_at AS createdAt,
         updated_at AS updatedAt,
         sync_status AS syncStatus
  FROM harvest_registration
`;

export const FARM_SELECT = `
  SELECT client_uuid AS clientUuid, name, district, sector,
         farm_size_ha AS farmSizeHa, latitude, longitude,
         created_at AS createdAt, updated_at AS updatedAt, sync_status AS syncStatus
  FROM local_farm
`;

export const RISK_SELECT = `
  SELECT id, harvest_client_uuid AS harvestClientUuid,
         risk_probability AS riskProbability, risk_band AS riskBand,
         factors_json AS factorsJson, actions_json AS actionsJson,
         model_version AS modelVersion, calculated_at AS calculatedAt,
         sync_status AS syncStatus
  FROM harvest_risk
`;

export const ATTACHMENT_SELECT = `
  SELECT client_uuid AS clientUuid, harvest_client_uuid AS harvestClientUuid,
         local_uri AS localUri, mime_type AS mimeType, file_name AS fileName,
         size_bytes AS sizeBytes, created_at AS createdAt,
         sync_status AS syncStatus, server_url AS serverUrl
  FROM harvest_attachment
`;
