import { describe, expect, it } from "vitest";

import { PANEL_UNITS } from "../src/constants/metrics";
import { kgPerHaToTonnesPerHa, tonnesPerHaToKgPerHa } from "../src/utils/units";

/**
 * The two published yield units.
 *
 * The national trend series publishes `yield_mt_ha` in t/ha and the district
 * productivity panel publishes `yield_kg_ha` in kg/ha. They are different
 * columns of different datasets, so the only permitted relationship between
 * them is this conversion.
 */
describe("published yield units", () => {
  it("keeps the two published columns on their own units", () => {
    expect(PANEL_UNITS.yield_kg_ha).toBe("kg/ha");
    expect(PANEL_UNITS.yield_kg_ha).not.toBe("t/ha");
    expect(PANEL_UNITS.production_mt).toBe("metric tonnes");
    expect(PANEL_UNITS.harvested_area_ha).toBe("ha");
  });

  it("converts kg/ha to t/ha exactly once", () => {
    expect(kgPerHaToTonnesPerHa(1300)).toBeCloseTo(1.3, 9);
    expect(kgPerHaToTonnesPerHa(2000)).toBe(2);
  });

  it("round-trips without drift", () => {
    for (const value of [640, 1284.127, 2000, 0.5]) {
      expect(tonnesPerHaToKgPerHa(kgPerHaToTonnesPerHa(value) as number)).toBeCloseTo(value, 6);
    }
  });

  it("never turns a missing value into zero", () => {
    expect(kgPerHaToTonnesPerHa(null)).toBeNull();
    expect(kgPerHaToTonnesPerHa(undefined)).toBeNull();
    expect(kgPerHaToTonnesPerHa(Number.NaN)).toBeNull();
    expect(tonnesPerHaToKgPerHa(null)).toBeNull();
    expect(kgPerHaToTonnesPerHa(0)).toBe(0);
  });
});
