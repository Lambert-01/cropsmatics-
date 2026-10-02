/**
 * Small, pure summaries of the district yield rows.
 *
 * These live outside the page so the arithmetic can be tested directly. Nothing
 * here recomputes a published figure: every value is read from the row the API
 * returned, and a district with no published yield is excluded from the counts
 * rather than treated as zero.
 */

import type { ProductivityResponse } from "@/types";

export type DistrictRow = ProductivityResponse["rows"][number];

/** A district with one measured value attached. */
export interface DistrictValue {
  district: string;
  value: number;
}

export interface DistrictSummary {
  /** Districts in the current selection. */
  n: number;
  /** Districts that actually carry a published yield. */
  nWithYield: number;
  /** Districts whose gap index is positive, i.e. below their own benchmark. */
  nBelowBenchmark: number;
  nAtOrAboveBenchmark: number;
  /** Share below benchmark, over the districts that have a measurable gap. */
  shareBelowBenchmarkPct: number | null;
  highest: DistrictValue | null;
  lowest: DistrictValue | null;
  largestGap: DistrictValue | null;
}

function num(row: DistrictRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Summarise the district rows for the Overview workspace.
 *
 * A positive ``gap_index`` means the district is *below* its benchmark — the
 * API's own ``top_gaps`` ranks descending on that basis — so the sign is read
 * directly rather than re-derived.
 */
export function summarizeDistricts(rows: DistrictRow[]): DistrictSummary {
  let nWithYield = 0;
  let nBelowBenchmark = 0;
  let nAtOrAboveBenchmark = 0;
  let highest: DistrictValue | null = null;
  let lowest: DistrictValue | null = null;
  let largestGap: DistrictValue | null = null;

  for (const row of rows) {
    const district = String(row.district ?? "");
    if (!district) continue;

    const yieldValue = num(row, "yield_kg_ha");
    if (yieldValue !== null) {
      nWithYield += 1;
      if (highest === null || yieldValue > highest.value) highest = { district, value: yieldValue };
      if (lowest === null || yieldValue < lowest.value) lowest = { district, value: yieldValue };
    }

    const gap = num(row, "gap_index");
    if (gap !== null) {
      if (gap > 0) nBelowBenchmark += 1;
      else nAtOrAboveBenchmark += 1;
      if (largestGap === null || gap > largestGap.value) largestGap = { district, value: gap };
    }
  }

  const measurable = nBelowBenchmark + nAtOrAboveBenchmark;
  return {
    n: rows.length,
    nWithYield,
    nBelowBenchmark,
    nAtOrAboveBenchmark,
    shareBelowBenchmarkPct: measurable > 0 ? (nBelowBenchmark / measurable) * 100 : null,
    highest,
    lowest,
    largestGap,
  };
}
