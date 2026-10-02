import { describe, expect, it } from "vitest";

import {
  bandForGap,
  dumbbellEndpoints,
  dumbbellRows,
  exclusionCounts,
  gapScaleDomain,
  rankedByGap,
  toDistrictGapRows,
  type ProductivityRow,
} from "@/features/productivity/gap";
import type { GapBand } from "@/types";

/**
 * The gap panel's contract.
 *
 * These guard the two ways the replaced heatmap could mislead: presenting an
 * unpublishable district as if it had a value, and letting a district's colour
 * depend on which neighbours happened to be on screen.
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

describe("toDistrictGapRows", () => {
  it("names the API's columns and keeps their units", () => {
    const [parsed] = toDistrictGapRows([row()]);
    expect(parsed).toEqual({
      district: "Nyagatare",
      province: "Eastern",
      yieldKgHa: 900,
      benchmarkKgHa: 1500,
      gapIndex: 40,
      harvestedAreaHa: 12000,
      productionMt: 10800,
    });
  });

  it("treats an absent or non-numeric column as unpublished, never as zero", () => {
    const [missing, text, infinite] = toDistrictGapRows([
      row({ gap_index: null, yield_kg_ha: undefined }),
      row({ gap_index: "40" as unknown as number }),
      row({ gap_index: Number.NaN }),
    ]);
    expect(missing.gapIndex).toBeNull();
    expect(missing.yieldKgHa).toBeNull();
    // A string from the API is not a number; coercing it would show a value the
    // panel never published.
    expect(text.gapIndex).toBeNull();
    expect(infinite.gapIndex).toBeNull();
  });

  it("drops rows that carry no district", () => {
    expect(toDistrictGapRows([row({ district: undefined as unknown as string })])).toHaveLength(0);
  });
});

describe("rankedByGap", () => {
  const rows = toDistrictGapRows([
    row({ district: "A", gap_index: 5 }),
    row({ district: "B", gap_index: 55 }),
    row({ district: "C", gap_index: null }),
    row({ district: "D", gap_index: 20 }),
  ]);

  it("orders by widest shortfall first", () => {
    expect(rankedByGap(rows).map((r) => r.district)).toEqual(["B", "D", "A"]);
  });

  it("never ranks a district that has no published gap", () => {
    expect(rankedByGap(rows).some((r) => r.district === "C")).toBe(false);
  });

  it("respects the limit and breaks ties on name for a stable order", () => {
    expect(rankedByGap(rows, 2).map((r) => r.district)).toEqual(["B", "D"]);
    const tied = toDistrictGapRows([
      row({ district: "Zeta", gap_index: 10 }),
      row({ district: "Alpha", gap_index: 10 }),
    ]);
    expect(rankedByGap(tied).map((r) => r.district)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("dumbbellRows", () => {
  it("pairs benchmark with observed yield, ascending, in kg/ha", () => {
    const [paired] = dumbbellRows(toDistrictGapRows([row()]));
    expect(paired.range).toEqual([900, 1500]);
    // Benchmark is the HIGH end here, so the district sits below it.
    expect(paired.benchmarkIsLower).toBe(false);
    expect(paired.shortfallKgHa).toBe(600);
  });

  it("flips the ends when the district is above its benchmark", () => {
    const [paired] = dumbbellRows(
      toDistrictGapRows([row({ district: "Musanze", yield_kg_ha: 2000, gap_index: -33.3 })]),
    );
    expect(paired.range).toEqual([1500, 2000]);
    expect(paired.benchmarkIsLower).toBe(true);
    // A negative shortfall is above benchmark, which is the only reading that
    // keeps "positive = worse" true for every view.
    expect(paired.shortfallKgHa).toBe(-500);
  });

  it("drops a district missing either end rather than drawing it partially", () => {
    const rows = toDistrictGapRows([
      row({ district: "NoBenchmark", benchmark_yield_kg_ha: null }),
      row({ district: "NoYield", yield_kg_ha: null }),
      row({ district: "Complete" }),
    ]);
    expect(dumbbellRows(rows).map((r) => r.district)).toEqual(["Complete"]);
  });

  it("orders by shortfall when the API withheld a gap index", () => {
    const rows = toDistrictGapRows([
      row({ district: "Small", yield_kg_ha: 1450, gap_index: null }),
      row({ district: "Large", yield_kg_ha: 600, gap_index: null }),
    ]);
    expect(dumbbellRows(rows).map((r) => r.district)).toEqual(["Large", "Small"]);
  });

  it("agrees with the sign of the published gap index", () => {
    // The invariant that makes "higher is worse" a safe label on every view.
    for (const yieldKgHa of [400, 900, 1500, 2200]) {
      const [paired] = dumbbellRows(toDistrictGapRows([row({ yield_kg_ha: yieldKgHa })]));
      expect(paired.shortfallKgHa > 0).toBe(paired.benchmarkKgHa > paired.yieldKgHa);
    }
  });
});

describe("dumbbellEndpoints", () => {
  // The range bar is always drawn left-to-right as [low, high].
  it("puts the benchmark at the low end when the district is above it", () => {
    expect(dumbbellEndpoints({ x: 100, width: 40, benchmarkIsLower: true })).toEqual({
      benchmarkX: 100,
      observedX: 140,
    });
  });

  it("puts the benchmark at the high end when the district is below it", () => {
    expect(dumbbellEndpoints({ x: 100, width: 40, benchmarkIsLower: false })).toEqual({
      benchmarkX: 140,
      observedX: 100,
    });
  });

  it("never places both dots at the same pixel", () => {
    for (const width of [1, 12, 400]) {
      for (const benchmarkIsLower of [true, false]) {
        const { benchmarkX, observedX } = dumbbellEndpoints({ x: 0, width, benchmarkIsLower });
        expect(benchmarkX).not.toBe(observedX);
      }
    }
  });

  it("agrees with the row's own shortfall direction", () => {
    // Below benchmark (positive shortfall) must draw the observed dot left of the
    // benchmark dot, because a smaller yield maps to a smaller pixel x.
    const below = dumbbellRows(
      toDistrictGapRows([
        row({ district: "Below", yield_kg_ha: 900, benchmark_yield_kg_ha: 1500 }),
      ]),
    )[0];
    const { benchmarkX, observedX } = dumbbellEndpoints({
      x: 0,
      width: 100,
      benchmarkIsLower: below.benchmarkIsLower,
    });
    expect(below.shortfallKgHa).toBeGreaterThan(0);
    expect(observedX).toBeLessThan(benchmarkX);

    const above = dumbbellRows(
      toDistrictGapRows([
        row({ district: "Above", yield_kg_ha: 2200, benchmark_yield_kg_ha: 1500 }),
      ]),
    )[0];
    const ends = dumbbellEndpoints({ x: 0, width: 100, benchmarkIsLower: above.benchmarkIsLower });
    expect(above.shortfallKgHa).toBeLessThan(0);
    expect(ends.observedX).toBeGreaterThan(ends.benchmarkX);
  });
});

describe("gapScaleDomain", () => {
  it("spans every published gap, not just the ranked slice", () => {
    const rows = toDistrictGapRows([
      row({ district: "A", gap_index: -10 }),
      row({ district: "B", gap_index: 80 }),
      row({ district: "C", gap_index: 5 }),
    ]);
    // C is cut from a top-2 ranking, but it still sets the scale's reach, so a
    // district's colour cannot shift because a neighbour scrolled out of view.
    expect(gapScaleDomain(rows)).toEqual({ min: -10, max: 80 });
  });

  it("returns a degenerate domain when nothing is published", () => {
    expect(gapScaleDomain(toDistrictGapRows([row({ gap_index: null })]))).toEqual({
      min: 0,
      max: 0,
    });
    expect(gapScaleDomain([])).toEqual({ min: 0, max: 0 });
  });
});

describe("bandForGap", () => {
  const bands: GapBand[] = [
    { id: "above_benchmark", label: "Above benchmark", max_pct: 0, count: 3 },
    { id: "near_benchmark", label: "Near benchmark", min_pct: 0, max_pct: 10, count: 5 },
    { id: "moderate_gap", label: "Moderate gap", min_pct: 10, max_pct: 25, count: 4 },
    { id: "high_gap", label: "High gap", min_pct: 25, count: 2 },
  ];

  it("uses the API's own cut points", () => {
    expect(bandForGap(bands, -5)?.id).toBe("above_benchmark");
    expect(bandForGap(bands, 0)?.id).toBe("near_benchmark");
    expect(bandForGap(bands, 9.9)?.id).toBe("near_benchmark");
    expect(bandForGap(bands, 10)?.id).toBe("moderate_gap");
    expect(bandForGap(bands, 60)?.id).toBe("high_gap");
  });

  it("returns nothing rather than guessing when there is no value", () => {
    expect(bandForGap(bands, null)).toBeNull();
    expect(bandForGap([], 12)).toBeNull();
  });
});

describe("exclusionCounts", () => {
  it("counts what each view had to leave out, so the UI can say so", () => {
    const rows = toDistrictGapRows([
      row({ district: "Complete" }),
      row({ district: "NoGap", gap_index: null }),
      row({ district: "NoBenchmark", benchmark_yield_kg_ha: null }),
    ]);
    expect(exclusionCounts(rows)).toEqual({ total: 3, withGap: 2, withComparison: 2 });
  });
});
