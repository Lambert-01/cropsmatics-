/**
 * Two-period district change (view D — "who moved, and which way").
 *
 * Answers "which districts improved or worsened between period A and period B?"
 * using only the productivity panel's own published `yield_kg_ha` column in each
 * period. It is a *change between two observed releases*, not a trend fit, not a
 * forecast, and not a causal claim: a district that rose may have risen for any
 * reason, and this module never says why.
 *
 * Pure and synchronous, so the classification rules are unit-testable without a
 * chart or a DOM.
 *
 * HONESTY RULES (mirrors the rest of the analytics layer):
 *   - A district missing a published yield in EITHER period is `insufficient`.
 *     It is never treated as zero, never carries over the other period's value,
 *     and never appears as "no change".
 *   - A percentage change needs a positive baseline. A zero/negative baseline
 *     yields a null rate, and the direction is judged on the absolute sign only.
 *   - A movement smaller than FLAT_THRESHOLD_PCT is "flat" — reported as no
 *     meaningful change rather than dressed up as an improvement.
 */

import { toDistrictGapRows, type ProductivityRow } from "./gap";

export type ChangeDirection = "improved" | "declined" | "flat" | "insufficient";

/** Relative movement at or below this (in %) is treated as no meaningful change. */
export const FLAT_THRESHOLD_PCT = 2;

export interface DistrictChangeRow {
  district: string;
  province: string | null;
  /** Observed yield in the earlier period, kg/ha. Null when unpublished. */
  fromYieldKgHa: number | null;
  /** Observed yield in the later period, kg/ha. Null when unpublished. */
  toYieldKgHa: number | null;
  /** to - from, kg/ha. Null unless both sides are published. */
  deltaKgHa: number | null;
  /** Percentage change against the earlier period. Null when the change has no
   *  expressible rate (unpublished side, or a non-positive baseline). */
  deltaPct: number | null;
  direction: ChangeDirection;
}

/**
 * Classify a single district's movement from one observed yield to another.
 *
 * `from`/`to` are kg/ha. Anything that is not a finite number is treated as
 * unpublished, which short-circuits to `insufficient`.
 */
export function classifyChange(
  fromYieldKgHa: number | null,
  toYieldKgHa: number | null,
): { deltaKgHa: number | null; deltaPct: number | null; direction: ChangeDirection } {
  if (
    fromYieldKgHa === null ||
    toYieldKgHa === null ||
    !Number.isFinite(fromYieldKgHa) ||
    !Number.isFinite(toYieldKgHa)
  ) {
    return { deltaKgHa: null, deltaPct: null, direction: "insufficient" };
  }

  const deltaKgHa = toYieldKgHa - fromYieldKgHa;
  // A rate needs a positive, non-trivial base. A zero baseline is not a rate.
  const deltaPct = fromYieldKgHa > 0 ? (deltaKgHa / fromYieldKgHa) * 100 : null;

  if (deltaPct !== null) {
    if (Math.abs(deltaPct) < FLAT_THRESHOLD_PCT) {
      return { deltaKgHa, deltaPct, direction: "flat" };
    }
    return { deltaKgHa, deltaPct, direction: deltaKgHa > 0 ? "improved" : "declined" };
  }

  // No expressible rate: judge on the absolute sign alone, with an exact zero
  // (rather than a sub-threshold percentage) counting as flat.
  if (deltaKgHa === 0) return { deltaKgHa, deltaPct, direction: "flat" };
  return { deltaKgHa, deltaPct, direction: deltaKgHa > 0 ? "improved" : "declined" };
}

/**
 * Build the per-district change across two productivity panels.
 *
 * The earlier panel is `fromRows`, the later is `toRows`. Only rows that carry a
 * district are considered. Districts present in just one panel are kept so the
 * UI can count them as `insufficient` rather than silently dropping them.
 */
export function buildDistrictChange(
  fromRows: readonly ProductivityRow[],
  toRows: readonly ProductivityRow[],
): DistrictChangeRow[] {
  const fromMap = new Map<string, ReturnType<typeof toDistrictGapRows>[number]>();
  for (const row of toDistrictGapRows(fromRows)) {
    if (row.district) fromMap.set(row.district, row);
  }
  const toMap = new Map<string, ReturnType<typeof toDistrictGapRows>[number]>();
  for (const row of toDistrictGapRows(toRows)) {
    if (row.district) toMap.set(row.district, row);
  }

  const districts = Array.from(new Set([...fromMap.keys(), ...toMap.keys()])).sort((a, b) =>
    a.localeCompare(b),
  );

  return districts
    .map((district) => {
      const from = fromMap.get(district);
      const to = toMap.get(district);
      const { deltaKgHa, deltaPct, direction } = classifyChange(
        from?.yieldKgHa ?? null,
        to?.yieldKgHa ?? null,
      );
      return {
        district,
        province: to?.province ?? from?.province ?? null,
        fromYieldKgHa: from?.yieldKgHa ?? null,
        toYieldKgHa: to?.yieldKgHa ?? null,
        deltaKgHa,
        deltaPct,
        direction,
      };
    })
    .sort((a, b) => {
      // Districts with an expressible change first (largest movement up top),
      // then the rank of unpublished movements, then alphabetical.
      const order: Record<ChangeDirection, number> = {
        improved: 0,
        declined: 1,
        flat: 2,
        insufficient: 3,
      };
      const rank = order[a.direction] - order[b.direction];
      if (rank !== 0) return rank;
      const av = a.deltaPct ?? Number.NEGATIVE_INFINITY;
      const bv = b.deltaPct ?? Number.NEGATIVE_INFINITY;
      return bv - av || a.district.localeCompare(b.district);
    });
}

/** Counts the UI needs to state what it could and could not compare. */
export function changeSummary(rows: readonly DistrictChangeRow[]): {
  total: number;
  improved: number;
  declined: number;
  flat: number;
  insufficient: number;
  comparable: number;
} {
  const count = (direction: ChangeDirection) =>
    rows.filter((row) => row.direction === direction).length;
  const insufficient = count("insufficient");
  return {
    total: rows.length,
    improved: count("improved"),
    declined: count("declined"),
    flat: count("flat"),
    insufficient,
    comparable: rows.length - insufficient,
  };
}

