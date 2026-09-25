import { describe, expect, it } from "vitest";

import {
  KG_PER_TONNE,
  MAX_ATTACHMENT_BYTES,
  formatQuantity,
  fromKilograms,
  parseQuantity,
  toKilograms,
} from "../src/utils/units";
import { isValidIsoDate, toIsoDate, validateHarvestDates } from "../src/utils/dates";

describe("quantity conversion", () => {
  it("treats kilograms as the canonical unit", () => {
    expect(toKilograms(250, "kg")).toBe(250);
    expect(fromKilograms(250, "kg")).toBe(250);
  });

  it("converts tonnes to kilograms and back without drift", () => {
    expect(toKilograms(1.5, "tonnes")).toBe(1500);
    expect(fromKilograms(1500, "tonnes")).toBe(1.5);
    expect(KG_PER_TONNE).toBe(1000);
  });

  it("parses user input and rejects unusable values", () => {
    expect(parseQuantity("1,250")).toBe(1250);
    expect(parseQuantity(" 40 ")).toBe(40);
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("-5")).toBeNull();
  });

  it("formats with the unit's natural precision", () => {
    expect(formatQuantity(1500, "kg")).toContain("kg");
    expect(formatQuantity(1500, "tonnes")).toContain("t");
    expect(formatQuantity(null, "kg")).toBe("—");
  });

  it("keeps the local attachment cap at or below the server allowance", () => {
    // The server default is 20-25 MB; the client must never exceed it or a user
    // could stage a file that the API then rejects.
    expect(MAX_ATTACHMENT_BYTES).toBeLessThanOrEqual(20 * 1024 * 1024);
  });
});

describe("date handling", () => {
  it("formats dates as unambiguous ISO strings", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("28/02/2026")).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
  });

  it("requires the end date to be on or after the start", () => {
    expect(validateHarvestDates("2026-03-01", "2026-02-28", { today: "2026-03-01" })).toMatchObject({
      ok: false,
      field: "end",
    });
    expect(validateHarvestDates("2026-03-01", "2026-03-01", { today: "2026-03-01" }).ok).toBe(true);
    expect(validateHarvestDates("2026-03-01", "2026-04-01", { today: "2026-03-05" }).ok).toBe(true);
  });

  it("flags implausibly old start dates (usually a mistyped year)", () => {
    const result = validateHarvestDates("2019-01-01", null, { today: "2026-09-25" });
    expect(result.ok).toBe(false);
    expect(result.field).toBe("start");
  });

  it("allows an empty window because both dates are optional", () => {
    expect(validateHarvestDates(null, null, { today: "2026-09-25" }).ok).toBe(true);
  });
});
