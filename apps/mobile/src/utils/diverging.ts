/**
 * Zero-centered ("diverging") bar layout for signed values.
 *
 * The productivity gap index is signed: a POSITIVE gap means the district is
 * BELOW its benchmark, a NEGATIVE gap means it is ABOVE. The previous
 * horizontal bar chart scaled every bar as `value / max`, which is only defined
 * for a non-negative range — a negative value produced a negative width, clamped
 * back up to a 2 % stub, so a district above benchmark rendered as a thin sliver
 * identical to a near-zero one. That silently inverted the meaning of the chart.
 *
 * This module computes the layout for a bar with a shared zero baseline: positive
 * values grow right from the centre, negative values grow left, and a zero value
 * keeps a visible sliver so "no gap" is not mistaken for "no data". Pure and
 * dependency-free so the geometry is unit-testable without a renderer.
 */

export type DivergingSide = "left" | "right" | "none";

export interface DivergingBar {
  /** Which side of the zero baseline the fill occupies. */
  side: DivergingSide;
  /** Fill width as a percentage of the half-track, in [0, 100]. */
  widthPct: number;
  /** True when the value is negative (left of the baseline). */
  negative: boolean;
}

/** Smallest visible fill, so a zero or tiny value still reads as a bar. */
export const MIN_BAR_PCT = 2;

/**
 * The largest magnitude in a set of values, or 0 when none are finite.
 *
 * The domain is the maximum absolute value, so the baseline at 50 % puts the
 * largest positive and the largest negative bar at the same visual scale.
 */
export function maxMagnitude(values: readonly (number | null | undefined)[]): number {
  let max = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      max = Math.max(max, Math.abs(value));
    }
  }
  return max;
}

/** True when any finite value is strictly negative. */
export function hasNegative(values: readonly (number | null | undefined)[]): boolean {
  return values.some((value) => typeof value === "number" && Number.isFinite(value) && value < 0);
}

/**
 * Lay out one bar against a diverging axis.
 *
 * `value === null` (or non-finite) is "unpublished" and returns no fill at all —
 * it is never drawn at zero. A published zero returns a minimum-width sliver on
 * the right so the row stays visible.
 */
export function divergingBar(value: number | null | undefined, maxAbs: number): DivergingBar {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { side: "none", widthPct: 0, negative: false };
  }
  const negative = value < 0;
  // Guard a zero or degenerate domain: every bar is then the minimum sliver.
  if (maxAbs <= 0 || !Number.isFinite(maxAbs)) {
    return { side: negative ? "left" : "right", widthPct: MIN_BAR_PCT, negative };
  }
  const raw = (Math.abs(value) / maxAbs) * 100;
  return {
    side: negative ? "left" : "right",
    widthPct: Math.min(100, Math.max(MIN_BAR_PCT, raw)),
    negative,
  };
}
