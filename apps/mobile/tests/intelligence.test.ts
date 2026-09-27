import { describe, expect, it } from "vitest";

import { CREATE_INDEXES, CREATE_TABLES } from "../src/database/schema";
import { resolveCropSlug, resolveDistrictSlug, slugifyEntity } from "../src/utils/slug";

const DDL = CREATE_TABLES.join("\n");

describe("url-safe entity slugs", () => {
  it("slugifies multi-word names without spaces", () => {
    expect(slugifyEntity("Irish Potato")).toBe("irish-potato");
    expect(slugifyEntity("Kigali City")).toBe("kigali-city");
    expect(slugifyEntity("  Paddy rice  ")).toBe("paddy-rice");
  });

  it("prefers the stable code over the name", () => {
    expect(resolveCropSlug({ crop_code: "CROP-POT", crop_name: "Irish potato" })).toBe("CROP-POT");
    expect(resolveDistrictSlug({ district_code: "RW-NO-RUL", district: "Rulindo" })).toBe("RW-NO-RUL");
  });

  it("falls back to a slug when no code exists", () => {
    expect(resolveCropSlug({ crop_name: "Irish Potato" })).toBe("irish-potato");
    expect(resolveDistrictSlug({ district: "Kigali City" })).toBe("kigali-city");
  });

  it("never produces a route with a raw space", () => {
    for (const name of ["Irish Potato", "Paddy rice", "Kigali City"]) {
      expect(resolveCropSlug({ crop_name: name })).not.toContain(" ");
    }
  });
});

describe("intelligence storage tables", () => {
  it("defines saved items, ask history and private inquiry receipts", () => {
    for (const table of ["saved_item", "ask_history", "inquiry_receipt", "inquiry_draft"]) {
      expect(DDL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    const all = CREATE_INDEXES.join("\n");
    expect(all).toContain("saved_item");
    expect(all).toContain("ask_history");
  });

  it("enforces one saved row per entity type and key", () => {
    expect(DDL).toContain("UNIQUE (type, entity_key)");
  });

  it("migrates additively only — never drops stored user data", () => {
    const all = [...CREATE_TABLES, ...CREATE_INDEXES].join("\n").toUpperCase();
    expect(all).not.toContain("DROP TABLE");
    expect(all).not.toContain("DROP COLUMN");
  });
});
