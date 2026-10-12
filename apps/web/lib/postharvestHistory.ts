import type { PostharvestHistoryObservation, PostharvestShareTotal } from "@/types";

/**
 * Pure selectors over the multi-period post-harvest panel
 * (`GET /analytics/postharvest-history`, 2024A-2026B).
 *
 * Three rules, all of them data-integrity rules rather than styling:
 *
 * * a published null stays null and is **never** rendered as `0` - a missing
 *   share is missing, not zero;
 * * published shares are used exactly as published. Where a crop x release group
 *   does not total 100 within the rounding tolerance the group is *flagged*
 *   (`shares_sum_ok: false`), never rescaled, so the chart shows the official
 *   number and the panel says why it does not add up;
 * * every ordering is derived from the period codes themselves, so a group can
 *   never appear in arrival order.
 */

/** Published use indicators, in the order a composition reads best. */
export const PH_INDICATOR_ORDER = [
  "sold_pct",
  "own_consumption_pct",
  "stored_pct",
  "seeds_pct",
  "fodder_pct",
  "gift_pct",
  "barter_pct",
  "hired_labour_wages_pct",
  "farm_rent_pct",
  "post_harvest_losses_pct",
  "other_usage_pct",
] as const;

const PH_INDICATOR_LABELS: Record<string, string> = {
  sold_pct: "Sold",
  own_consumption_pct: "Own consumption",
  stored_pct: "Stored",
  seeds_pct: "Seed",
  fodder_pct: "Fodder",
  gift_pct: "Given away",
  barter_pct: "Bartered",
  hired_labour_wages_pct: "Hired labour wages",
  farm_rent_pct: "Farm rent",
  post_harvest_losses_pct: "Post-harvest losses",
  other_usage_pct: "Other use",
};

export function phIndicatorLabel(code: string): string {
  return PH_INDICATOR_LABELS[code] ?? code.replace(/_pct$/, "").replace(/_/g, " ");
}

/** Chronological order of the published codes (2024A < 2024B < 2025A ...). */
export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => a.localeCompare(b));
}

export interface CompositionRow {
  indicator_code: string;
  label: string;
  value: number;
}

/**
 * The use composition of one crop in one release, largest share first.
 * Rows with no published value are dropped rather than shown as zero.
 */
export function compositionFor(
  observations: PostharvestHistoryObservation[],
  crop: string,
  period: string,
): CompositionRow[] {
  const byIndicator = new Map<string, number>();
  for (const row of observations) {
    if (row.crop !== crop || row.period_code !== period) continue;
    if (row.value === null || row.value === undefined) continue;
    byIndicator.set(row.indicator_code, row.value);
  }
  return PH_INDICATOR_ORDER.filter((code) => byIndicator.has(code))
    .map((code) => ({
      indicator_code: code,
      label: phIndicatorLabel(code),
      value: byIndicator.get(code) as number,
    }))
    .sort((a, b) => b.value - a.value);
}

export interface SeriesPoint {
  period: string;
  value: number | null;
}

/**
 * One indicator for one crop across every release it was published for.
 * A release with no published value keeps its slot with `null` so the axis does
 * not silently contract around the data that happens to exist.
 */
export function indicatorSeries(
  observations: PostharvestHistoryObservation[],
  crop: string,
  indicator: string,
  periods: string[],
): SeriesPoint[] {
  const valueByPeriod = new Map<string, number | null>();
  for (const row of observations) {
    if (row.crop !== crop || row.indicator_code !== indicator) continue;
    valueByPeriod.set(row.period_code, row.value ?? null);
  }
  return sortPeriods(periods).map((period) => ({
    period,
    value: valueByPeriod.has(period) ? (valueByPeriod.get(period) as number | null) : null,
  }));
}

export interface RankingRow {
  crop: string;
  value: number;
}

/**
 * Every crop's value for one indicator in one release, largest first.
 * Crops with nothing published for that release are excluded, not ranked last:
 * "we do not have this" must never read as "this crop scored zero".
 */
export function cropRanking(
  observations: PostharvestHistoryObservation[],
  period: string,
  indicator: string,
): RankingRow[] {
  const byCrop = new Map<string, number>();
  for (const row of observations) {
    if (row.period_code !== period || row.indicator_code !== indicator) continue;
    if (row.value === null || row.value === undefined) continue;
    byCrop.set(row.crop, row.value);
  }
  return [...byCrop.entries()]
    .map(([crop, value]) => ({ crop, value }))
    .sort((a, b) => b.value - a.value || a.crop.localeCompare(b.crop));
}

export interface ShareFlag {
  shares_sum_pct: number | null;
  shares_sum_ok: boolean;
}

/**
 * Whether the selected crop x release group totals 100 within tolerance.
 * `null` when the panel carries no total for that group, which is reported as
 * "not checked" rather than as a pass.
 */
export function shareFlag(
  totals: PostharvestShareTotal[],
  crop: string,
  period: string,
): ShareFlag | null {
  const hit = totals.find((t) => t.crop === crop && t.period_code === period);
  if (!hit) return null;
  return {
    shares_sum_pct: hit.shares_sum_pct ?? null,
    shares_sum_ok: hit.shares_sum_ok === true,
  };
}

/** Indicator codes the panel actually carries, in reading order. */
export function availableIndicators(
  observations: PostharvestHistoryObservation[],
): string[] {
  const present = new Set(observations.map((row) => row.indicator_code));
  const ordered = PH_INDICATOR_ORDER.filter((code) => present.has(code));
  const extra = [...present].filter((code) => !(PH_INDICATOR_ORDER as readonly string[]).includes(code));
  return [...ordered, ...extra.sort()];
}
