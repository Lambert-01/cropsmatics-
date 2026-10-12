/**
 * Multi-series chart selection.
 *
 * The national adoption chart used to draw six indicators at once. Six lines on
 * one axis is a wall, not an insight: the reader cannot tell which practice moved
 * without hunting. The product rule is therefore "show a readable default, offer
 * the rest", which needs three decisions that are worth testing rather than
 * burying in a component:
 *
 * * which series actually carry data (a series with no published value is not a
 *   choice worth offering);
 * * which subset is default-visible;
 * * what toggling does, including never allowing an empty chart.
 *
 * Pure, so the rules can be asserted directly.
 */

export interface SeriesSpec {
  key: string;
  label: string;
  color: string;
}

/** Default number of simultaneously visible series. */
export const DEFAULT_VISIBLE_SERIES = 3;

/** A point is a record of series key -> value, where absent means "not published". */
export type SeriesPoint = Record<string, unknown>;

/**
 * Declared series that have at least one published value anywhere in the data.
 *
 * A missing value is `null`/`undefined`, never `0` - the pipeline distinguishes
 * "NISR did not publish this" from "the published value is zero", so this does
 * too.
 */
export function availableSeriesKeys(
  specs: readonly SeriesSpec[],
  points: readonly SeriesPoint[],
): string[] {
  return specs
    .map((spec) => spec.key)
    .filter((key) => points.some((point) => point[key] !== null && point[key] !== undefined));
}

/**
 * The default visible set: the first `limit` series that carry data, in the
 * declared order (which the callers order by analytical importance, not by value).
 */
export function defaultSeriesKeys(
  specs: readonly SeriesSpec[],
  points: readonly SeriesPoint[],
  limit: number = DEFAULT_VISIBLE_SERIES,
): string[] {
  return availableSeriesKeys(specs, points).slice(0, Math.max(limit, 1));
}

/**
 * Toggle one series.
 *
 * Removing the last visible series is refused: an empty chart is not a state the
 * reader asked for, and it looks identical to "no data published".
 */
export function toggleSeriesKey(current: readonly string[], key: string): string[] {
  if (current.includes(key)) {
    if (current.length <= 1) return [...current];
    return current.filter((value) => value !== key);
  }
  return [...current, key];
}

/** `["a", "b"]` -> `"a, b"` for a chart subtitle. */
export function seriesLabelText(keys: readonly string[], specs: readonly SeriesSpec[]): string {
  const labels = keys
    .map((key) => specs.find((spec) => spec.key === key)?.label ?? key)
    .filter(Boolean);
  return labels.join(", ");
}
