/**
 * Trend-series merging for the crop comparison overlay.
 *
 * Two `PeriodTrendResponse`s (e.g. a district and the national series, or two
 * districts) are aligned on the canonical period code so a period carried by only
 * one side stays a real, single-sided point rather than being dropped. Pure and
 * synchronous, so the alignment rule is unit-testable without a chart.
 *
 * Nothing is interpolated: a period a side did not publish is `null` for that
 * side, and the chart draws the line with `connectNulls={false}` so the gap is
 * visible.
 */

import type { PeriodTrendResponse } from "@/types";

/** The published columns the trend chart can plot. */
export type CropTrendMetric = "yield_kg_ha" | "production_mt" | "harvested_area_ha";

export interface MergedTrendPoint {
  period_code: string;
  period: string;
  primary: number | null;
  comparison: number | null;
}

function valueAt(response: PeriodTrendResponse | undefined, periodCode: string, metric: CropTrendMetric): number | null {
  const point = response?.points.find((p) => p.period_code === periodCode);
  const value = point?.values[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Align two trend responses on their published period codes.
 *
 * Returns the union of periods, ascending. When no comparison is supplied this
 * is simply the primary series with `comparison: null` throughout.
 */
export function mergeTrendSeries(
  primary: PeriodTrendResponse | undefined,
  comparison: PeriodTrendResponse | undefined,
  metric: CropTrendMetric,
): MergedTrendPoint[] {
  const codes = new Set<string>();
  (primary?.points ?? []).forEach((p) => codes.add(p.period_code));
  (comparison?.points ?? []).forEach((p) => codes.add(p.period_code));

  const labelFor = (code: string) =>
    primary?.points.find((p) => p.period_code === code)?.label ??
    comparison?.points.find((p) => p.period_code === code)?.label ??
    code;

  return Array.from(codes)
    .sort((a, b) => a.localeCompare(b))
    .map((period_code) => ({
      period_code,
      period: labelFor(period_code),
      primary: valueAt(primary, period_code, metric),
      comparison: valueAt(comparison, period_code, metric),
    }));
}

/** Count of periods carrying at least one finite value on either side. */
export function publishedTrendCount(points: readonly MergedTrendPoint[]): number {
  return points.filter((p) => p.primary !== null || p.comparison !== null).length;
}

/**
 * One point of the yield-over-time chart, including the production line and the
 * optional comparison overlay.
 *
 * The primary yield and its comparison are aligned on the period code; the
 * production column is only ever taken from the primary series, because the
 * overlay exists to compare one metric (yield) and mixing a second metric's
 * comparison into one chart would imply a relationship that is not measured.
 */
export interface YieldOverlayPoint {
  period_code: string;
  label: string;
  yield_kg_ha: number | null;
  comparison_yield_kg_ha: number | null;
  production_mt: number | null;
}

/**
 * Build the yield-over-time series, optionally restricted to one season.
 *
 * `sameSeasonOnly` keeps only points whose `season` matches, which is the honest
 * year-on-year read; the overlay is filtered on the same rule so both lines
 * describe the same agronomic seasons.
 */
export function yieldOverlayPoints(
  primary: PeriodTrendResponse | undefined,
  comparison: PeriodTrendResponse | undefined,
  options: { sameSeasonOnly?: boolean; season?: string } = {},
): YieldOverlayPoint[] {
  const keep = (point: PeriodTrendResponse["points"][number]) =>
    !options.sameSeasonOnly || !options.season || point.season === options.season;
  const filteredPrimary = primary ? { ...primary, points: primary.points.filter(keep) } : undefined;
  const filteredComparison = comparison
    ? { ...comparison, points: comparison.points.filter(keep) }
    : undefined;

  const merged = mergeTrendSeries(filteredPrimary, filteredComparison, "yield_kg_ha");
  const production = new Map(
    (filteredPrimary?.points ?? []).map((point) => [
      point.period_code,
      point.values.production_mt ?? null,
    ]),
  );

  return merged.map((point) => ({
    period_code: point.period_code,
    label: point.period,
    yield_kg_ha: point.primary,
    comparison_yield_kg_ha: point.comparison,
    production_mt: production.get(point.period_code) ?? null,
  }));
}
