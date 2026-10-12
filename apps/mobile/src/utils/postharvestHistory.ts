import type {
  PostHarvestHistoryObservation,
  PostHarvestShareTotal,
} from "../types";
import type { Strings } from "../i18n";

/**
 * Pure selectors over `GET /analytics/postharvest-history`
 * (2024A-2026B, 17 crops, 11 indicators).
 *
 * The rules match the web client exactly, because the two clients read the same
 * published panel and must not disagree about it:
 *
 * * a share that was never published stays `null` and is never rendered as `0`;
 * * published shares are used as published - a crop x release group whose shares
 *   do not total 100 within the rounding tolerance is flagged, never rescaled;
 * * releases are ordered by their own codes, never by arrival order.
 */

/** The use shares this screen offers over time, each with its existing i18n key. */
export const HISTORY_INDICATORS: { code: string; key: keyof Strings }[] = [
  { code: "sold_pct", key: "sold" },
  { code: "stored_pct", key: "stored" },
  { code: "own_consumption_pct", key: "homeConsumption" },
  { code: "seeds_pct", key: "seed" },
  { code: "post_harvest_losses_pct", key: "losses" },
];

/** Chronological order of the published codes (2024A < 2024B < 2025A ...). */
export function sortHistoryPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => a.localeCompare(b));
}

export interface HistoryPoint {
  period: string;
  value: number | null;
}

/**
 * One use share for one crop across every release it was published for.
 *
 * Every requested release keeps its slot: a release with nothing published for
 * this crop holds `null`, so the chart draws a gap instead of contracting its
 * axis - or worse, bridging the gap with a straight line that never happened.
 */
export function historySeries(
  observations: PostHarvestHistoryObservation[],
  crop: string,
  indicator: string,
  periods: string[],
): HistoryPoint[] {
  const byPeriod = new Map<string, number | null>();
  for (const row of observations) {
    if ((row.crop ?? row.canonical_crop_name) !== crop) continue;
    if (row.indicator_code !== indicator) continue;
    byPeriod.set(row.period_code, row.value);
  }
  return sortHistoryPeriods(periods).map((period) => ({
    period,
    value: byPeriod.has(period) ? (byPeriod.get(period) as number | null) : null,
  }));
}

/** Which of the offered shares this crop actually has a published value for. */
export function availableHistoryIndicators(
  observations: PostHarvestHistoryObservation[],
  crop: string,
): string[] {
  const present = new Set<string>();
  for (const row of observations) {
    if ((row.crop ?? row.canonical_crop_name) !== crop) continue;
    if (row.value !== null && row.value !== undefined) present.add(row.indicator_code);
  }
  return HISTORY_INDICATORS.map((item) => item.code).filter((code) => present.has(code));
}

export interface HistoryShareFlag {
  shares_sum_pct: number | null;
  shares_sum_ok: boolean;
}

/**
 * Whether the selected crop x release group totals 100 within tolerance.
 * `null` when the panel carries no total for that group - reported as "not
 * checked", never as a pass.
 */
export function historyShareFlag(
  totals: PostHarvestShareTotal[],
  crop: string,
  period: string,
): HistoryShareFlag | null {
  const hit = totals.find((total) => total.crop === crop && total.period_code === period);
  if (!hit) return null;
  return { shares_sum_pct: hit.shares_sum_pct, shares_sum_ok: hit.shares_sum_ok === true };
}
