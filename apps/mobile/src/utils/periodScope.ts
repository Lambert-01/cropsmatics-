/**
 * Year/season scoping for the crop catalogue.
 *
 * The published period axis is a list of ``YYYY S`` codes (``2025B``). A year
 * filter must resolve to the seasons NISR actually published for that year - not
 * to a calendar assumption and never to an aggregate across seasons that are not
 * comparable agronomically. Everything here derives from the axis the board
 * returned, so the controls can only offer what the data carries.
 *
 * Pure and platform-free so it can be unit tested.
 */

export interface PeriodScope {
  year: number | null;
  season: string | null;
}

/** Published years, newest first - the order a selector should offer them. */
export function availableYears(periods: readonly string[]): number[] {
  const years = new Set<number>();
  for (const code of periods) {
    const year = Number(String(code).slice(0, 4));
    if (Number.isFinite(year) && year > 1900) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Seasons published for one year, in ``A B C`` order.
 *
 * Before 2026 NISR published three seasons a year; the 2026 releases so far cover
 * A and B only. Which ones exist is read from the data, so a missing season is
 * absent rather than offered and then empty.
 */
export function availableSeasons(periods: readonly string[], year: number | null): string[] {
  const seasons = new Set<string>();
  for (const code of periods) {
    const value = String(code);
    if (year !== null && Number(value.slice(0, 4)) !== year) continue;
    const season = value.slice(4, 5);
    if (season) seasons.add(season);
  }
  return [...seasons].sort();
}

/**
 * Keep a scope honest after the axis or the year changes.
 *
 * A season that the newly selected year did not publish is cleared rather than
 * kept: leaving it would request a period the release does not have, and the
 * screen would show an empty catalogue that looks like missing data rather than
 * an impossible selection.
 */
export function reconcileScope(scope: PeriodScope, periods: readonly string[]): PeriodScope {
  const years = availableYears(periods);
  const year = scope.year !== null && years.includes(scope.year) ? scope.year : null;
  if (year === null) return { year: null, season: null };

  const seasons = availableSeasons(periods, year);
  const season = scope.season && seasons.includes(scope.season) ? scope.season : null;
  return { year, season };
}

/**
 * A period requested by a link, but only if this view really publishes it.
 *
 * Deep links carry a period across screens that do not cover the same calendar:
 * the map's layers and the district comparison publish different periods. An
 * incompatible code must be dropped, not forced into a selector that has no data
 * behind it - the comparison then keeps its own valid default instead.
 */
export function compatiblePeriod(
  requested: string | null | undefined,
  publishedPeriods: readonly string[],
): string | null {
  const code = (requested ?? "").trim().toUpperCase();
  if (!code) return null;
  return publishedPeriods.includes(code) ? code : null;
}

/**
 * The label for a scope, e.g. ``2025``, ``2025 Season B`` or ``All periods``.
 *
 * Used in section captions so a card always states the calendar it belongs to
 * instead of showing a filtered figure under an unfiltered heading.
 */
export function scopeLabel(scope: PeriodScope): string {
  if (scope.year === null) return "";
  return scope.season ? `${scope.year} Season ${scope.season}` : String(scope.year);
}
