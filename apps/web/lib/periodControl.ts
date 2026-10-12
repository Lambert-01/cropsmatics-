/**
 * Period-axis helpers for the compact scope control.
 *
 * The Overview used to render every published release as an equally prominent
 * card, so fourteen seasons filled the first screen with a list instead of an
 * answer. The control that replaced it needs three things, all of them derivable
 * from the published axis the API already returns:
 *
 * * which years were published, and which seasons each of them really carried;
 * * one compact sentence naming the historical range and the latest release;
 * * a canonical period code built from a year + season, so a selection is a
 *   single value rather than two that have to be kept in step.
 *
 * Pure and separately tested: getting the range label wrong is a claim about the
 * data, and a claim about the data should not live inside a `<select onChange>`.
 */

import { sortPeriods, type PeriodTimelineItem } from "./coverage";
import { splitPeriod } from "./filters";

/** A published period, reduced to the fields the control reads. */
export interface PeriodAxisItem {
  period_code: string;
  label: string;
}

/** Published years, newest first (the newest year is the useful default end). */
export function publishedYears(periods: readonly PeriodAxisItem[]): string[] {
  const years = new Set<string>();
  for (const period of periods) {
    const { year } = splitPeriod(period.period_code);
    if (year) years.add(String(year));
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

/** Season letters published within one year, in publication order (A, B, C). */
export function seasonsForYear(
  periods: readonly PeriodAxisItem[],
  year: string | number | undefined,
): string[] {
  if (year === undefined || year === null || year === "") return [];
  const seasons = new Set<string>();
  for (const period of periods) {
    const split = splitPeriod(period.period_code);
    if (split.year && String(split.year) === String(year) && split.season) {
      seasons.add(split.season);
    }
  }
  return [...seasons].sort();
}

/** `"2022B"` for a year + season, or `undefined` when the pair is incomplete. */
export function periodCodeFor(
  year: string | number | undefined,
  season: string | undefined,
): string | undefined {
  if (year === undefined || year === null || year === "") return undefined;
  const letter = (season ?? "").trim().toUpperCase();
  if (!letter) return undefined;
  return `${year}${letter}`;
}

/**
 * The compact supporting line under the scope control.
 *
 * Both facts come from the published axis the API returned, so the sentence
 * cannot describe a different calendar than the control it annotates - and it
 * never hard-codes "2026B", which will stop being the latest release.
 */
export function publishedRangeSummary(
  periods: readonly PeriodTimelineItem[],
  {
    formatLabel = (item: PeriodAxisItem) => item.label,
  }: { formatLabel?: (item: PeriodAxisItem) => string } = {},
): string | null {
  if (periods.length === 0) return null;

  const ordered = sortPeriods(periods.map((period) => period.period_code));
  const firstYear = splitPeriod(ordered[0]).year;
  const lastYear = splitPeriod(ordered[ordered.length - 1]).year;

  // Chronological order decides what "latest" means, with the API's flag as a
  // fallback rather than the first answer. The axis is built from published
  // releases, so the greatest code *is* the latest release; preferring the flag
  // would let a stale or duplicated `is_latest` name an older season.
  const latestCode = ordered[ordered.length - 1];
  const latest =
    periods.find((period) => period.period_code === latestCode) ??
    periods.find((period) => period.is_latest);

  const range =
    firstYear && lastYear
      ? firstYear === lastYear
        ? String(firstYear)
        : `${firstYear}–${lastYear}`
      : `${ordered[0]}–${ordered[ordered.length - 1]}`;

  const latestLabel = latest ? formatLabel(latest) : null;
  const releaseWord = periods.length === 1 ? "release" : "releases";

  return [
    `Historical data: ${range}`,
    latestLabel ? `Latest published season: ${latestLabel}` : null,
    `${periods.length} ${releaseWord}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Which coverage level a whole axis substantiates.
 *
 * Used for the control's own coverage line, so "all published periods" cannot be
 * read as "district data everywhere" when some release in the range is national
 * only. The per-release truth stays in the coverage popover.
 */
export function axisCoverageNote(periods: readonly PeriodTimelineItem[]): string | null {
  if (periods.length === 0) return null;
  const nationalOnly = periods.filter(
    (period) => (period.coverage_level ?? "").toLowerCase() === "national",
  ).length;
  const unrecorded = periods.filter((period) => !period.coverage_level).length;

  const parts: string[] = [];
  if (nationalOnly > 0) {
    parts.push(
      `${nationalOnly} of ${periods.length} releases are national only and are never drawn as a district map.`,
    );
  }
  if (unrecorded > 0) {
    parts.push(
      `${unrecorded} of ${periods.length} have no coverage recorded in the serving catalogue.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
