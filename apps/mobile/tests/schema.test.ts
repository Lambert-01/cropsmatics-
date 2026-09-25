import { describe, expect, it } from "vitest";

import {
  CREATE_INDEXES,
  CREATE_TABLES,
  HARVEST_ADDED_COLUMNS,
  HARVEST_SELECT,
  SCHEMA_VERSION,
} from "../src/database/schema";

const DDL = CREATE_TABLES.join("\n");

describe("sqlite schema", () => {
  it("creates every table idempotently", () => {
    for (const table of [
      "harvest_registration",
      "outbox",
      "local_farm",
      "harvest_risk",
      "harvest_attachment",
    ]) {
      expect(DDL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("never drops or destroys local data in a migration", () => {
    // A farmer's phone can hold unsynced records for weeks: a schema change
    // must be additive. This guards against a future DROP/DELETE creeping in.
    const all = [...CREATE_TABLES, ...CREATE_INDEXES].join("\n").toUpperCase();
    expect(all).not.toContain("DROP TABLE");
    expect(all).not.toContain("DROP COLUMN");
    expect(all).not.toContain("DELETE FROM");
  });

  it("keeps the log outbox keyed by the idempotency uuid", () => {
    expect(DDL).toContain("client_uuid TEXT PRIMARY KEY NOT NULL");
    expect(CREATE_INDEXES.some((sql) => sql.includes("idx_outbox_status"))).toBe(true);
  });

  it("adds new harvest columns as nullable or defaulted so old rows still load", () => {
    const added = Object.entries(HARVEST_ADDED_COLUMNS);
    expect(added.length).toBeGreaterThan(0);
    for (const [name, ddl] of added) {
      const nullableOrDefaulted = !/NOT NULL/.test(ddl) || /DEFAULT/.test(ddl);
      expect(nullableOrDefaulted, `${name} must be nullable or defaulted`).toBe(true);
    }
  });

  it("covers the fields required to complete a harvest registration", () => {
    for (const column of [
      "farm_client_uuid",
      "harvest_start_date",
      "harvest_end_date",
      "latitude",
      "longitude",
      "notes",
      "needs_storage_assistance",
    ]) {
      expect(HARVEST_ADDED_COLUMNS).toHaveProperty(column);
      expect(HARVEST_SELECT).toContain(column);
    }
  });

  it("records a monotonic schema version", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
  });

  it("stores risk results locally with their model version", () => {
    expect(DDL).toContain("harvest_client_uuid TEXT NOT NULL");
    expect(DDL).toContain("risk_probability REAL NOT NULL");
    expect(DDL).toContain("model_version TEXT");
  });
});
