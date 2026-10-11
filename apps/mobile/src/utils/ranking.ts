/**
 * Ranking a crop board by one metric.
 *
 * Pure and platform-free so it can be unit tested, and deliberately strict about
 * what counts as a value:
 *
 * * a crop's rank uses its **latest published** value for the metric - the last
 *   non-null point on the shared period axis, not the last index;
 * * a crop whose entire series is null is **excluded**, never ranked as zero.
 *   "NISR did not publish this" and "NISR published zero" are different facts,
 *   and collapsing them would put a crop at the bottom of a ranking it never
 *   entered;
 * * equal values keep board order, so the same data always ranks the same way.
 */

import type { NationalBoardCrop } from "../types";

export interface RankedCrop {
  crop: string;
  /** The latest published value for the metric. Never a substituted zero. */
  value: number;
  /** Period code the value belongs to, read off the shared period axis. */
  period: string;
}

/**
 * The top ``limit`` crops by their latest published value for ``metric``.
 *
 * ``periods`` is the shared axis the board's series are index-aligned with, so
 * each ranked row can name the period its value came from.
 */
export function rankCropsByLatest(
  crops: readonly NationalBoardCrop[] | undefined,
  metric: string,
  periods: readonly string[],
  limit: number,
): RankedCrop[] {
  const rankable: RankedCrop[] = [];

  for (const crop of crops ?? []) {
    const series = crop.series?.[metric] ?? [];
    // Walk backwards to the last real observation. A null means the season was
    // not tabulated for this crop, not that the value was zero.
    for (let index = series.length - 1; index >= 0; index -= 1) {
      const value = series[index];
      if (typeof value === "number" && Number.isFinite(value)) {
        rankable.push({ crop: crop.crop, value, period: String(periods[index] ?? "") });
        break;
      }
    }
  }

  // The index tiebreak makes the order deterministic rather than dependent on
  // the engine's sort stability.
  return rankable
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.value - a.row.value || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.row);
}
