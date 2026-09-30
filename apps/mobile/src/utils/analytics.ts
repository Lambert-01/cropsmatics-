/**
 * Pure analytical helpers for the mobile data workspace.
 *
 * Everything here is deliberately free of React Native imports so it can be
 * unit-tested in a plain node environment and reused by charts, tables and map
 * layers without duplicating the rules.
 *
 * What this module is allowed to do
 * ---------------------------------
 * It subsets, sorts and formats values that the Python/FastAPI service has
 * already published, and it compares two published observations. It never
 * invents a value: a missing observation stays ``null``, is never treated as
 * zero, and is never connected across.
 *
 * What it must never do
 * ---------------------
 * - Aggregate district rows into a national figure (the API publishes national
 *   rows separately, and the two are different populations).
 * - Compare raw yield levels across different crops.
 * - Report a change from anything other than two comparable non-null
 *   observations of the same metric, season and geography.
 */

/** A published observation keyed by a period code such as ``2026B``. */
export interface RawPoint {
  period: string;
  label?: string | null;
  values: Record<string, number | null>;
}

/** One plotted point. ``null`` means "not published for this period". */
export interface SeriesPoint {
  label: string;
  value: number | null;
}

/**
 * The canonical period-aware endpoints name the period ``period_code`` while
 * the national trend endpoint names it ``period``. Both are the same YYYYS
 * dimension, so one adapter converts between them instead of every screen
 * branching on which endpoint it called.
 */
export interface PeriodCodedPoint {
  period_code: string;
  label?: string | null;
  values: Record<string, number | null>;
}

export function fromPeriodCoded(points: readonly PeriodCodedPoint[]): RawPoint[] {
  return points.map((point) => ({
    period: point.period_code,
    label: point.label,
    values: point.values ?? {},
  }));
}

export type SeasonLetter = "A" | "B" | "C";

/** The season letter of a ``YYYY<S>`` period code, or null when it is not one. */
export function seasonOf(period: string): SeasonLetter | null {
  const match = /^(20\d{2})([ABC])$/i.exec(String(period ?? "").trim());
  if (!match) return null;
  return match[2].toUpperCase() as SeasonLetter;
}

/** ``2026B`` -> ``2026``, or null when the code is not a YYYYS period. */
export function yearOf(period: string): number | null {
  const match = /^(20\d{2})([ABC])$/i.exec(String(period ?? "").trim());
  return match ? Number(match[1]) : null;
}

/** Chronological sort key for a period code (unknown codes sort first). */
export function periodRank(period: string): number {
  const year = yearOf(period);
  const season = seasonOf(period);
  if (year === null || season === null) return -1;
  return year * 10 + (season.charCodeAt(0) - 64);
}

/** A new array in published chronological order; the input is not mutated. */
export function sortPoints<T extends { period: string }>(points: readonly T[]): T[] {
  return [...points].sort((a, b) => periodRank(a.period) - periodRank(b.period));
}

/**
 * The same season one year earlier (``2026B`` -> ``2025B``).
 *
 * Seasons differ agronomically, so stepping A -> B -> C is not a time series.
 * Returns null when the code is not a YYYYS period.
 */
export function sameSeasonPrevious(period: string): string | null {
  const year = yearOf(period);
  const season = seasonOf(period);
  if (year === null || season === null) return null;
  return `${year - 1}${season}`;
}

/** The label a point should carry on a chart's x axis. */
export function pointLabel(point: RawPoint): string {
  return point.label ?? point.period;
}

/**
 * One metric across the published points, as chart-ready values.
 *
 * A metric the API did not publish for a period is ``null`` — the point is kept
 * so the gap is visible on the x axis instead of silently closed up.
 */
export function toSeriesPoints(points: readonly RawPoint[], metric: string): SeriesPoint[] {
  return sortPoints(points).map((point) => ({
    label: pointLabel(point),
    value: nonNull(point.values?.[metric]),
  }));
}

function nonNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface Observation {
  period: string;
  label: string;
  value: number;
}

/** The latest period that actually published a value for this metric. */
export function latestObservation(
  points: readonly RawPoint[],
  metric: string,
): Observation | null {
  const ordered = sortPoints(points);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const point = ordered[index];
    const value = nonNull(point.values?.[metric]);
    if (value !== null) {
      return { period: point.period, label: pointLabel(point), value };
    }
  }
  return null;
}

/**
 * Signed percentage change, or ``null`` when it cannot be computed.
 *
 * ``null`` when either observation is missing. A zero or negative baseline
 * returns null as well: a percentage change against zero is not a number, and
 * reporting one would fabricate a magnitude.
 */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface ChangeResult {
  metric: string;
  current: Observation;
  previous: Observation;
  changePct: number;
  /** Absolute difference in the metric's own unit. */
  changeAbs: number;
}

/**
 * Same-season change: the latest published value against the same season one
 * year earlier.
 *
 * Both observations must exist for the same metric and the same season. A
 * missing prior year means no change is reported at all, never a change of
 * "0%" and never a comparison against a different season.
 */
export function sameSeasonChange(
  points: readonly RawPoint[],
  metric: string,
): ChangeResult | null {
  const current = latestObservation(points, metric);
  if (!current) return null;
  const previousPeriod = sameSeasonPrevious(current.period);
  if (!previousPeriod) return null;
  const previousPoint = points.find((point) => point.period === previousPeriod);
  if (!previousPoint) return null;
  const previousValue = nonNull(previousPoint.values?.[metric]);
  if (previousValue === null) return null;
  const changePct = percentChange(current.value, previousValue);
  if (changePct === null) return null;
  return {
    metric,
    current,
    previous: {
      period: previousPeriod,
      label: pointLabel(previousPoint),
      value: previousValue,
    },
    changePct,
    changeAbs: current.value - previousValue,
  };
}

/** Consecutive run of periods with a published value. */
export interface SeriesSegment {
  start: number;
  end: number;
  points: SeriesPoint[];
}

/**
 * Split a series into runs of consecutive published points.
 *
 * This is what makes a line break at a missing period instead of drawing
 * straight through it as if the crop had been harvested that season.
 * Single published points come back as one-point segments so they can still be
 * drawn as a dot.
 */
export function seriesSegments(points: readonly SeriesPoint[]): SeriesSegment[] {
  const segments: SeriesSegment[] = [];
  let run: { start: number; points: SeriesPoint[] } | null = null;
  points.forEach((point, index) => {
    if (point.value === null) {
      run = null;
      return;
    }
    if (!run) {
      run = { start: index, points: [] };
      segments.push({ start: index, end: index, points: run.points });
    }
    run.points.push(point);
    segments[segments.length - 1].end = index;
  });
  return segments;
}

/** True when every published value is the same number. */
export function isConstant(points: readonly SeriesPoint[]): boolean {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) return false;
  return values.every((value) => value === values[0]);
}

/** Number of periods with an actual value. */
export function publishedCount(points: readonly SeriesPoint[]): number {
  return points.filter((point) => point.value !== null).length;
}

/**
 * A padded domain for the y axis.
 *
 * A constant series gets a symmetric band around its value, so the line sits in
 * the middle of the plot instead of collapsing onto an axis. Negative values are
 * part of the domain, never clamped to zero.
 */
export function yDomain(points: readonly SeriesPoint[]): { min: number; max: number } {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (!values.length) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  }
  const span = max - min;
  return { min, max: max + span * 0.08 };
}

/** Tick values across a domain, rounded to readable steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return [];
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalised = rawStep / magnitude;
  const stepMultiplier = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  const step = stepMultiplier * magnitude;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 0.001; value += step) {
    // Round away floating-point noise such as 0.30000000000000004.
    ticks.push(Number(value.toFixed(6)));
    if (ticks.length > 12) break;
  }
  return ticks;
}

/**
 * Keep at most ``maxLabels`` x labels, evenly spaced, by blanking the rest.
 *
 * Returns an array the same length as the input so it stays index-aligned with
 * the plotted points; positions that should stay blank are ``null``.
 */
export function thinLabels(labels: readonly string[], maxLabels: number): (string | null)[] {
  const total = labels.length;
  if (total === 0) return [];
  if (maxLabels <= 0) return labels.map(() => null);
  if (total <= maxLabels) return labels.map((label) => label);
  const keep = new Set<number>();
  const step = (total - 1) / (maxLabels - 1);
  for (let i = 0; i < maxLabels; i += 1) keep.add(Math.round(i * step));
  // The last published period is the one a reader looks for first.
  keep.add(total - 1);
  return labels.map((label, index) => (keep.has(index) ? label : null));
}

/** Format a number with a precision that suits its magnitude. */
export function formatValue(value: number | null | undefined, precision?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const digits =
    precision ??
    (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 2 : 3);
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** A value with its unit, or an em dash when it was not published. */
export function formatMetric(
  value: number | null | undefined,
  unit?: string | null,
  precision?: number,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const text = formatValue(value, precision);
  return unit ? `${text} ${unit}` : text;
}

/** ``+12.3%`` / ``−4.0%``; null in, "—" out. */
export function formatPercent(value: number | null | undefined, precision = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(precision)}%`;
}

/**
 * Index a per-crop series against a baseline so crops with different natural
 * yield scales can be compared on one axis.
 *
 * ``baseline`` must come from the Python service. This only divides by it.
 * A missing baseline or a non-positive value yields no points rather than an
 * index computed against an arbitrary constant.
 */
export function indexedSeries(
  points: readonly RawPoint[],
  metric: string,
  baseline: number | null,
): SeriesPoint[] {
  if (baseline === null || !Number.isFinite(baseline) || baseline <= 0) return [];
  return toSeriesPoints(points, metric).map((point) => ({
    label: point.label,
    value: point.value === null ? null : (point.value / baseline) * 100,
  }));
}

/**
 * Median of the published values of one crop, used as that crop's own baseline.
 *
 * This is a local fallback for display only; the preferred baseline is the
 * API-published one. Returns null when there is nothing to average, which is
 * what keeps an index from being computed at all.
 */
export function localBaseline(values: readonly (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!real.length) return null;
  const mid = Math.floor(real.length / 2);
  return real.length % 2 === 1 ? real[mid] : (real[mid - 1] + real[mid]) / 2;
}

/** Point of a series nearest to an x offset in pixels. */
export function nearestIndex(offsetX: number, plotLeft: number, plotWidth: number, count: number): number {
  if (count <= 1) return 0;
  const ratio = (offsetX - plotLeft) / (plotWidth || 1);
  const index = Math.round(ratio * (count - 1));
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * Values in the two most recent published periods, for a compact "latest vs
 * previous published" readout where a same-season pair does not exist.
 */
export function lastTwoPublished(
  points: readonly RawPoint[],
  metric: string,
): { current: Observation; previous: Observation } | null {
  const published: Observation[] = [];
  for (const point of sortPoints(points)) {
    const value = nonNull(point.values?.[metric]);
    if (value !== null) published.push({ period: point.period, label: pointLabel(point), value });
  }
  if (published.length < 2) return null;
  return {
    current: published[published.length - 1],
    previous: published[published.length - 2],
  };
}

/** Which season the same-season view focuses on. */
export function latestSeason(points: readonly RawPoint[]): SeasonLetter | null {
  const ordered = sortPoints(points);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const season = seasonOf(ordered[index].period);
    if (season) return season;
  }
  return null;
}

/** Subset a series to one season across years. Published points only. */
export function filterSeason(points: readonly RawPoint[], season: SeasonLetter | null): RawPoint[] {
  if (!season) return [...points];
  return points.filter((point) => seasonOf(point.period) === season);
}

// ---- platform-computed change -----------------------------------------------

/**
 * Shape of a change the API already computed and authorised.
 *
 * Declared structurally rather than imported from the API types so this module
 * stays free of service imports and can be unit-tested in isolation.
 */
export interface ApiChange {
  metric: string;
  unit?: string | null;
  available: boolean;
  reason?: string | null;
  period_code?: string | null;
  period_label?: string | null;
  previous_period_code?: string | null;
  previous_period_label?: string | null;
  current_value?: number | null;
  previous_value?: number | null;
  change_pct?: number | null;
  change_abs?: number | null;
}

/**
 * Adapt a platform-computed change for display, or null when it is not
 * available.
 *
 * The eligibility decision belongs to the API; this only reshapes what it
 * returned. An unavailable change becomes null so the caller renders the API's
 * own reason in words instead of a number.
 */
export function changeFromApi(change: ApiChange | null | undefined): ChangeResult | null {
  if (!change || !change.available) return null;
  if (change.change_pct === null || change.change_pct === undefined) return null;
  if (!change.period_code || !change.previous_period_code) return null;
  if (change.current_value === null || change.current_value === undefined) return null;
  if (change.previous_value === null || change.previous_value === undefined) return null;
  return {
    metric: change.metric,
    current: {
      period: change.period_code,
      label: change.period_label ?? change.period_code,
      value: change.current_value,
    },
    previous: {
      period: change.previous_period_code,
      label: change.previous_period_label ?? change.previous_period_code,
      value: change.previous_value,
    },
    changePct: change.change_pct,
    changeAbs: change.change_abs ?? change.current_value - change.previous_value,
  };
}

/**
 * Turn an axis-aligned board series into the shared point shape.
 *
 * The board guarantees one value per position per metric, so this is a zip, not
 * an alignment: a null at a position stays a null at the same period.
 */
export function boardPoints(
  board: {
    periods: readonly string[];
    period_labels?: Record<string, string>;
    series: Record<string, readonly (number | null)[]>;
  },
  metrics: readonly string[],
): RawPoint[] {
  return board.periods.map((code, index) => {
    const values: Record<string, number | null> = {};
    for (const metric of metrics) values[metric] = board.series?.[metric]?.[index] ?? null;
    return { period: code, label: board.period_labels?.[code] ?? code, values };
  });
}

// ---- multi-series alignment -------------------------------------------------

/**
 * A series keyed by period code rather than by a ragged list of points.
 *
 * The indexed-yield response returns each crop's own periods, so two crops in
 * the same response can have different lengths and different periods. Aligning
 * those point lists by array position would compare unrelated seasons.
 */
export interface PeriodKeyedSeries {
  key: string;
  label: string;
  valuesByPeriod: Record<string, number | null>;
}

/** Index an API point list by period code, keeping every published value. */
export function indexByPeriod(
  points: readonly { period: string; value?: number | null }[],
  pick: (point: { period: string; value?: number | null }) => number | null = (point) =>
    point.value ?? null,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const point of points) out[point.period] = pick(point);
  return out;
}

/** Period code -> display label, taken from whichever series published it. */
export function periodLabelMap(
  points: readonly { period: string; label?: string | null }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const point of points) if (point.label) out[point.period] = point.label;
  return out;
}

/**
 * Put every series on one ordered period axis.
 *
 * The output has exactly one point per period in `periods`, in that order, for
 * every series. A crop that was not tabulated in a period gets `null` there — a
 * visible gap — so the chart's positional alignment is guaranteed to compare the
 * same period across series instead of whatever happened to line up.
 *
 * Periods are ordered by their code, never by the order they appear in a
 * response, so a late-arriving series cannot reorder the axis.
 */
export function alignToPeriodAxis(
  series: readonly PeriodKeyedSeries[],
  periods: readonly string[],
  labelForPeriod?: (code: string) => string,
): { key: string; label: string; points: SeriesPoint[] }[] {
  const axis = [...periods].sort((a, b) => periodRank(a) - periodRank(b));
  return series.map((item) => ({
    key: item.key,
    label: item.label,
    points: axis.map((code) => ({
      label: labelForPeriod?.(code) ?? code,
      value: item.valuesByPeriod[code] ?? null,
    })),
  }));
}

/**
 * The union of every period any series published, chronologically ordered.
 *
 * Used to build the shared axis. It is derived from the data, so a period is on
 * the axis only because some series really has a value there.
 */
export function unionPeriods(points: readonly { period: string }[]): string[] {
  return Array.from(new Set(points.map((point) => point.period))).sort(
    (a, b) => periodRank(a) - periodRank(b),
  );
}

/** One indexed-yield series as the API returns it (period-coded, index value). */
export interface IndexedCropPoints {
  crop: string;
  points: readonly { period: string; label?: string | null; index?: number | null }[];
}

/**
 * Put indexed-yield series on one shared period axis, positionally safe.
 *
 * The Python service already returns every series aligned to its ``periods``
 * axis. This function *verifies* that contract and repairs it if it does not
 * hold (an older API build, or a hand-edited fixture): each series is re-keyed
 * by period code and re-emitted against the axis, with ``null`` wherever the
 * crop was not tabulated. Position *i* of every output series therefore always
 * describes ``axis[i]`` — a crop's observation can never appear under another
 * crop's date.
 *
 * The server's axis is preferred when it covers every published point; if it
 * does not, the union of the series' own periods is used instead and the
 * mismatch is reported in development, so a broken response is visible rather
 * than silently mis-aligned.
 */
export function alignIndexedSeries(
  series: readonly IndexedCropPoints[],
  periods: readonly string[],
): { key: string; label: string; points: SeriesPoint[] }[] {
  const published = series.flatMap((item) => item.points);
  const axisCoversAll = periods.length > 0 && published.every((point) => periods.includes(point.period));
  if (!axisCoversAll && published.length > 0 && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "[indexed-yield] response periods do not cover every series point; falling back to the union axis",
    );
  }
  const axis = axisCoversAll ? [...periods] : unionPeriods(published);
  const labels = periodLabelMap(published);
  return alignToPeriodAxis(
    series.map((item) => ({
      key: item.crop,
      label: item.crop,
      valuesByPeriod: indexByPeriod(
        item.points.map((point) => ({ period: point.period, value: point.index ?? null })),
      ),
    })),
    axis,
    (code) => labels[code] ?? code,
  );
}

/**
 * Index a table of rows by an entity key, keeping the published value of one
 * column.
 *
 * A row that exists but whose value is blank stays ``null`` rather than being
 * dropped, because "this geography has no published value" and "this geography
 * was never requested" must render differently.
 */
export function valueLookup<T extends object>(
  rows: readonly T[],
  idKey: keyof T,
  valueKey: keyof T,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const row of rows) {
    const id = row[idKey];
    if (typeof id !== "string" || !id) continue;
    const raw = row[valueKey];
    out.set(id, typeof raw === "number" && Number.isFinite(raw) ? raw : null);
  }
  return out;
}
