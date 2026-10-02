import { describe, expect, it } from "vitest";

import {
  FLAT_THRESHOLD_PCT,
  buildDistrictChange,
  changeSummary,
  classifyChange,
} from "@/features/productivity/change";
import type { ProductivityRow } from "@/features/productivity/gap";

/**
 * The two-period change contract.
 *
 * These guard the ways a change view can mislead: inventing a value for a
 * district published in only one period, treating an unpublished yield as zero,
 * and presenting sub-threshold noise as an improvement.
 */

const row = (over: Partial<ProductivityRow> = {}): ProductivityRow => ({
  district: "Nyagatare",
  province: "Eastern",
  yield_kg_ha: 900,
  benchmark_yield_kg_ha: 1500,
  gap_index: 40,
  harvested_area_ha: 12000,
  production_mt: 10800,
  ...over,
});

describe("classifyChange", () => {
  it("is insufficient when either side is unpublished, without inventing a delta", () => {
    expect(classifyChange(null, 900)).toEqual({
      deltaKgHa: null,
      deltaPct: null,
      direction: "insufficient",
    });
    expect(classifyChange(900, null).direction).toBe("insufficient");
    expect(classifyChange(Number.NaN, 900).direction).toBe("insufficient");
    expect(classifyChange(0, 0).direction).toBe("flat");
  });

  it("reports a rise as improved and a fall as declined, with a signed delta", () => {
    const up = classifyChange(1000, 1200);
    expect(up.direction).toBe("improved");
    expect(up.deltaKgHa).toBe(200);
    expect(up.deltaPct).toBeCloseTo(20, 6);

    const down = classifyChange(1000, 800);
    expect(down.direction).toBe("declined");
    expect(down.deltaKgHa).toBe(-200);
    expect(down.deltaPct).toBeCloseTo(-20, 6);
  });

  it("treats a sub-threshold movement as no meaningful change, not an improvement", () => {
    const justUnder = classifyChange(1000, 1000 + (FLAT_THRESHOLD_PCT - 0.1) * 10);
    expect(justUnder.direction).toBe("flat");
    const justOver = classifyChange(1000, 1000 + (FLAT_THRESHOLD_PCT + 0.1) * 10);
    expect(justOver.direction).toBe("improved");
  });

  it("has no rate against a non-positive baseline, but still reads the sign", () => {
    const up = classifyChange(0, 500);
    expect(up.deltaPct).toBeNull();
    expect(up.deltaKgHa).toBe(500);
    expect(up.direction).toBe("improved");
  });
});

describe("buildDistrictChange", () => {
  it("joins two panels by district and keeps one-sided districts as insufficient", () => {
    const from = [row({ district: "Nyagatare", yield_kg_ha: 1000 })];
    const to = [
      row({ district: "Nyagatare", yield_kg_ha: 1200 }),
      row({ district: "Huye", yield_kg_ha: 700 }),
    ];
    const built = buildDistrictChange(from, to);
    const byName = Object.fromEntries(built.map((r) => [r.district, r]));

    expect(byName.Nyagatare.direction).toBe("improved");
    expect(byName.Nyagatare.deltaKgHa).toBe(200);
    // Huye appears in only the later panel: reported, never given a change.
    expect(byName.Huye.direction).toBe("insufficient");
    expect(byName.Huye.deltaKgHa).toBeNull();
  });

  it("never substitutes zero for an unpublished yield", () => {
    const from = [row({ district: "Kirehe", yield_kg_ha: null })];
    const to = [row({ district: "Kirehe", yield_kg_ha: 900 })];
    const [only] = buildDistrictChange(from, to);
    expect(only.fromYieldKgHa).toBeNull();
    expect(only.direction).toBe("insufficient");
  });

  it("summarises comparable vs insufficient districts", () => {
    const from = [row({ district: "A", yield_kg_ha: 1000 }), row({ district: "B", yield_kg_ha: 1000 })];
    const to = [
      row({ district: "A", yield_kg_ha: 1300 }),
      row({ district: "B", yield_kg_ha: 1001 }),
    ];
    const summary = changeSummary(buildDistrictChange(from, to));
    expect(summary.total).toBe(2);
    expect(summary.comparable).toBe(2);
    expect(summary.improved).toBe(1);
    expect(summary.flat).toBe(1);
    expect(summary.insufficient).toBe(0);
  });
});
