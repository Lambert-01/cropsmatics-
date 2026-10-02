/**
 * Gap-panel derivations.
 *
 * The productivity panel returns rows as a loose `Record<string, string | number
 * | null>` keyed by the API's own column names. Everything downstream reads that
 * shape by string, so this module is the single place that names the columns,
 * parses them, and states what each one means. Pure and synchronous, so the
 * ranking and pairing rules are unit-testable without a chart or a DOM.
 *
 * METRIC SEMANTICS (these are the API's columns, not redefinitions):
 *
 *   yield_kg_ha            observed district yield, kg/ha
 *   benchmark_yield_kg_ha  the benchmark the API applied for the selected
 *                          strategy, kg/ha
 *   gap_index              % shortfall against that benchmark. POSITIVE means the
 *                          district is BELOW the benchmark. It is an index, not
 *                          a yield, and it is never rendered without its unit.
 *
 * Nothing here invents a value. A district with no published `gap_index` is not
 * ranked, and a district missing either side of the comparison is not plotted —
 * both are reported as excluded counts rather than drawn at zero.
 */

import type { GapBand, ProductivityResponse } from "@/types";

export type ProductivityRow = ProductivityResponse["rows"][number];

/** One district's published productivity columns, parsed and named. */
export interface DistrictGapRow {
  district: string;
  province: string | null;
  /** Observed yield, kg/ha. */
  yieldKgHa: number | null;
  /** The benchmark applied to this row, kg/ha. */
  benchmarkKgHa: number | null;
  /** % shortfall against the benchmark. Positive = below the benchmark. */
  gapIndex: number | null;
  harvestedAreaHa: number | null;
  productionMt: number | null;
}

/** A row the ranked bars can plot: it has a published gap index. */
export interface RankedGapRow extends DistrictGapRow {
  gapIndex: number;
}

/** A row the dumbbell can plot: both sides of the comparison are published. */
export interface DumbbellRow extends DistrictGapRow {
  yieldKgHa: number;
  benchmarkKgHa: number;
  /**
   * `[low, high]` in kg/ha.
   *
   * Recharts draws a *range* bar when the value is a two-element array, which is
   * what gives the dumbbell its connector. The array is always ascending, so the
   * shape needs `benchmarkIsLower` to know which end carries which dot.
   */
  range: [number, number];
  /** True when the benchmark is the lower value, i.e. the district is above it. */
  benchmarkIsLower: boolean;
  /** Benchmark minus observed, kg/ha. Positive = below the benchmark. */
  shortfallKgHa: number;
}

/** Read one numeric column, treating anything non-finite as unpublished. */
function numeric(row: ProductivityRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Parse and name every district row. Rows without a district are dropped. */
export function toDistrictGapRows(rows: readonly ProductivityRow[]): DistrictGapRow[] {
  return rows
    .map((row) => ({
      district: String(row.district ?? "").trim(),
      province: row.province === null || row.province === undefined ? null : String(row.province),
      yieldKgHa: numeric(row, "yield_kg_ha"),
      benchmarkKgHa: numeric(row, "benchmark_yield_kg_ha"),
      gapIndex: numeric(row, "gap_index"),
      harvestedAreaHa: numeric(row, "harvested_area_ha"),
      productionMt: numeric(row, "production_mt"),
    }))
    .filter((row) => row.district !== "");
}

/**
 * Districts ranked by how far below their benchmark they sit.
 *
 * Descending on `gap_index`, so the widest shortfall leads. This is the question
 * the ranked-bars view answers — "who is furthest below benchmark" — and it is
 * deliberately not sorted by yield, which answers a different question.
 */
export function rankedByGap(
  rows: readonly DistrictGapRow[],
  limit = Number.POSITIVE_INFINITY,
): RankedGapRow[] {
  return rows
    .filter((row): row is RankedGapRow => row.gapIndex !== null)
    .sort((a, b) => b.gapIndex - a.gapIndex || a.district.localeCompare(b.district))
    .slice(0, limit);
}

/**
 * Districts that can be drawn as a benchmark-to-actual pair.
 *
 * Ordered by shortfall (kg/ha) descending when a gap index is unavailable, so the
 * selection stays meaningful even if the API withheld the index for a row.
 */
export function dumbbellRows(
  rows: readonly DistrictGapRow[],
  limit = Number.POSITIVE_INFINITY,
): DumbbellRow[] {
  return rows
    .filter(
      (row): row is DistrictGapRow & { yieldKgHa: number; benchmarkKgHa: number } =>
        row.yieldKgHa !== null && row.benchmarkKgHa !== null,
    )
    .map((row) => {
      const shortfallKgHa = row.benchmarkKgHa - row.yieldKgHa;
      return {
        ...row,
        yieldKgHa: row.yieldKgHa,
        benchmarkKgHa: row.benchmarkKgHa,
        range: [
          Math.min(row.yieldKgHa, row.benchmarkKgHa),
          Math.max(row.yieldKgHa, row.benchmarkKgHa),
        ] as [number, number],
        benchmarkIsLower: row.benchmarkKgHa < row.yieldKgHa,
        shortfallKgHa,
      };
    })
    .sort(
      (a, b) =>
        (b.gapIndex ?? b.shortfallKgHa) - (a.gapIndex ?? a.shortfallKgHa) ||
        a.district.localeCompare(b.district),
    )
    .slice(0, limit);
}

/**
 * The domain the ranked bars colour against.
 *
 * Taken over the *whole* published set rather than the displayed slice, so the
 * colour a district gets never changes because a neighbour was cut by the top-N
 * limit. That is what lets the bars share a scale with the district map.
 */
export function gapScaleDomain(rows: readonly DistrictGapRow[]): { min: number; max: number } {
  const published = rows
    .map((row) => row.gapIndex)
    .filter((value): value is number => value !== null);
  if (published.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...published), max: Math.max(...published) };
}

/**
 * The API's own band for a gap value.
 *
 * Bands carry their own cut points and are never recomputed here, so a district
 * cannot be re-bucketed into a friendlier class by presentation code. Returns
 * null when the value falls outside every declared band, which the caller must
 * show as unclassified rather than guess at.
 */
export function bandForGap(bands: readonly GapBand[], gap: number | null): GapBand | null {
  if (gap === null || !Number.isFinite(gap)) return null;
  for (const band of bands) {
    const min = band.min_pct ?? Number.NEGATIVE_INFINITY;
    const max = band.max_pct ?? Number.POSITIVE_INFINITY;
    if (gap >= min && gap < max) return band;
  }
  return null;
}

/**
 * Which end of the plotted connector each value sits on.
 *
 * Recharts hands a range bar its geometry as `[x, x + width]` for the ascending
 * `[low, high]` pair, so the pixel end for the benchmark depends on which value
 * is lower. Getting this backwards would put the benchmark dot on the observed
 * yield and read as a real finding, which is exactly the kind of error a chart
 * hides and a table does not. Split out of the SVG shape so it is testable.
 */
export function dumbbellEndpoints({
  x,
  width,
  benchmarkIsLower,
}: {
  x: number;
  width: number;
  benchmarkIsLower: boolean;
}): { benchmarkX: number; observedX: number } {
  return {
    benchmarkX: benchmarkIsLower ? x : x + width,
    observedX: benchmarkIsLower ? x + width : x,
  };
}

/** How many rows each view had to drop, so the UI can say so out loud. */
export function exclusionCounts(rows: readonly DistrictGapRow[]): {
  total: number;
  withGap: number;
  withComparison: number;
} {
  return {
    total: rows.length,
    withGap: rows.filter((row) => row.gapIndex !== null).length,
    withComparison: rows.filter((row) => row.yieldKgHa !== null && row.benchmarkKgHa !== null)
      .length,
  };
}
