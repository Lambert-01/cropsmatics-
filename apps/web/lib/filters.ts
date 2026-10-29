/**
 * The central dashboard filter model. Filters live in the URL so every view is
 * shareable and every change requeries the API (no in-browser analytics).
 */

/**
 * Explicit analytical scope.
 *
 * ``history`` - all published periods. No single release is selected, so any
 *               panel that still needs one release names the snapshot the API
 *               returned rather than presenting it as the whole axis.
 * ``period``  - one published release, named by ``period``.
 *
 * The scope is an explicit state rather than "is a period set?". Without that,
 * "all published periods" is impossible to ask for once a default period is
 * stored in preferences, and a link cannot express it at all.
 */
export type ScopeView = "history" | "period";

export const SCOPE_HISTORY: ScopeView = "history";
export const SCOPE_PERIOD: ScopeView = "period";

export interface DashboardFilters {
  /**
   * Canonical period code (``2026B``), read from ``/meta/periods``.
   *
   * This is the period selector of record: when it is set the API receives
   * ``period_code`` and the legacy ``year``/``season`` pair is derived from it
   * so both the canonical and the legacy endpoints select the same release.
   */
  period?: string;
  /**
   * Resolved scope: all published periods, or the one release ``period`` names.
   *
   * Always set on the object returned by ``useFilters``; it may be absent on a
   * hand-built filter patch, which then keeps the legacy "period if present"
   * behaviour.
   */
  view?: ScopeView;
  /** Legacy year/season pair, still supported for older shared links. */
  year?: number;
  season?: string;
  crop?: string;
  province?: string;
  district?: string;
  benchmark?: string;
  /** Optional 2-5 crop comparison for national trends (comma-joined in URL). */
  compare?: string;
  /**
   * Explicit instruction not to layer the user's stored defaults onto this view.
   *
   * Written by "Reset filters". Without it a reset would clear the URL only, and
   * `resolveAnalyticalContext` would immediately re-apply a saved default crop or
   * district on the next render - so "reset" would mean "all crops" for one user
   * and "my saved crop" for another, and would change again after a reload.
   */
  defaults?: DefaultsMode;
}

export const DEFAULTS_STORED = "stored";
export const DEFAULTS_NONE = "none";
export type DefaultsMode = typeof DEFAULTS_NONE;

/** Read the explicit defaults mode from the URL, ignoring anything unrecognised. */
export function parseDefaultsMode(raw: string | null | undefined): DefaultsMode | undefined {
  return raw === DEFAULTS_NONE ? DEFAULTS_NONE : undefined;
}

/** Split a canonical ``2026B`` period code into its year and season. */
export function splitPeriod(
  period: string | undefined,
): { year?: number; season?: string } {
  const match = /^(\d{4})([ABC])$/.exec((period ?? "").trim().toUpperCase());
  if (!match) return {};
  return { year: Number(match[1]), season: match[2] };
}

export const BENCHMARK_OPTIONS = [
  {
    value: "national_crop_median",
    label: "National crop median",
    description: "Typical yield for this crop across the published comparison rows.",
  },
  {
    value: "national_crop_season_median",
    label: "National crop-season median",
    description: "Typical yield for this crop in the selected season.",
  },
  {
    value: "top_quartile_comparable_districts",
    label: "Top-quartile comparable districts",
    description: "Median yield among the strongest 25% of districts for this crop and season.",
  },
  {
    value: "agro_ecological_peer_group",
    label: "Agro-ecological peer group",
    description: "Typical yield among districts in the same crop, season and agro-ecological zone.",
  },
] as const;

export const DEFAULT_BENCHMARK = "national_crop_median";

export type BenchmarkStrategy = (typeof BENCHMARK_OPTIONS)[number]["value"];

export function benchmarkDescription(strategy: string | null | undefined): string {
  return (
    BENCHMARK_OPTIONS.find((option) => option.value === strategy)?.description ??
    "Comparison baseline used to calculate the productivity gap."
  );
}

/** Read the explicit scope from the URL, ignoring anything unrecognised. */
export function parseView(raw: string | null | undefined): ScopeView | undefined {
  if (raw === SCOPE_HISTORY || raw === SCOPE_PERIOD) return raw;
  return undefined;
}

/** Read filters from a URLSearchParams-like record. */
export function parseFilters(params: URLSearchParams | { get(key: string): string | null }): DashboardFilters {
  const period = params.get("period") ?? undefined;
  const yearRaw = params.get("year");
  return {
    period,
    view: parseView(params.get("view")),
    year: yearRaw ? Number(yearRaw) : undefined,
    season: params.get("season") ?? undefined,
    crop: params.get("crop") ?? undefined,
    province: params.get("province") ?? undefined,
    district: params.get("district") ?? undefined,
    benchmark: params.get("benchmark") ?? DEFAULT_BENCHMARK,
    compare: params.get("compare") ?? undefined,
    defaults: parseDefaultsMode(params.get("defaults")),
  };
}

/** Merge a patch into the current filters, dropping empties. */
export function mergeFilters(
  current: DashboardFilters,
  patch: Partial<DashboardFilters>,
): DashboardFilters {
  const next: DashboardFilters = { ...current, ...patch };
  (Object.keys(next) as (keyof DashboardFilters)[]).forEach((key) => {
    const value = next[key];
    if (value === undefined || value === "" || value === null) delete next[key];
  });
  return next;
}

export function filtersToQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  // The canonical period wins in the URL; year/season are only written when no
  // period code is selected, so a link can never carry a contradictory pair.
  if (filters.period) {
    params.set("period", filters.period);
  } else if (filters.view === SCOPE_HISTORY) {
    // "All published periods" is written down, not merely implied by the absence
    // of a period. Otherwise a stored default period would re-apply itself and
    // the page would come back on a different scope than the one that was
    // shared or reset to.
    params.set("view", SCOPE_HISTORY);
  } else {
    if (filters.year) params.set("year", String(filters.year));
    if (filters.season) params.set("season", filters.season);
  }
  if (filters.crop) params.set("crop", filters.crop);
  if (filters.province) params.set("province", filters.province);
  if (filters.district) params.set("district", filters.district);
  if (filters.benchmark && filters.benchmark !== DEFAULT_BENCHMARK) {
    params.set("benchmark", filters.benchmark);
  }
  if (filters.compare) params.set("compare", filters.compare);
  // "Ignore my stored defaults" is written down too, so a reset link means the
  // same thing in someone else's browser as it does in the one that made it.
  if (filters.defaults === DEFAULTS_NONE) params.set("defaults", DEFAULTS_NONE);
  return params.toString();
}

/** True when the filters describe the all-published-periods history scope. */
export function isHistoryScope(filters: DashboardFilters): boolean {
  return filters.view === SCOPE_HISTORY;
}

/**
 * The one-line scope label for a screen header.
 *
 * Pure and separately tested because this is the string that decides whether a
 * single-release snapshot is presented as the selection or as the whole
 * published axis. In history scope the snapshot release is named explicitly;
 * "all published periods" never stands in for a number that came from one.
 */
export function scopeSummaryText(opts: {
  view?: ScopeView;
  periodLabel?: string | null;
  snapshotLabel?: string | null;
}): string {
  if (opts.view === SCOPE_PERIOD) return opts.periodLabel?.trim() || "Selected period";
  const base = "All published periods";
  const snapshot = opts.snapshotLabel?.trim();
  return snapshot ? `${base} \u00b7 snapshot ${snapshot}` : base;
}

/**
 * Build the API query string (always includes the benchmark strategy).
 *
 * A canonical ``period`` is sent as ``period_code`` together with its derived
 * ``year``/``season`` so that period-aware endpoints (dashboard, analytics,
 * maps) and legacy year/season endpoints select the same release.
 *
 * This is the single description of what a scope *requests*, which is why
 * :func:`scopeKey` is derived from it rather than from the filter object.
 */
export function filtersToApiQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.view === SCOPE_HISTORY) {
    // Deliberately send no period at all. "All published periods" is a real
    // scope the API answers with its own history response; sending a period here
    // would silently turn it back into one release.
  } else if (filters.period) {
    const { year, season } = splitPeriod(filters.period);
    params.set("period_code", filters.period);
    if (year) params.set("year", String(year));
    if (season) params.set("season", season);
  } else {
    if (filters.year) params.set("year", String(filters.year));
    if (filters.season) params.set("season", filters.season);
  }
  if (filters.crop) params.set("crop", filters.crop);
  if (filters.province) params.set("province", filters.province);
  if (filters.district) params.set("district", filters.district);
  params.set("benchmark_strategy", filters.benchmark ?? DEFAULT_BENCHMARK);
  return params.toString();
}

/**
 * The query-key identity of an analytical scope.
 *
 * React Query caches and refetches by key, so the key *is* the definition of
 * "the same selection". Keying on the raw filter object made two filters that
 * describe one release look like two different scopes: a period plus the
 * year/season pair derived from it produced a second key for the same release,
 * so a chart that had already rendered was torn down and refetched - which is
 * the "chart appears, then disappears" behaviour, not a loading state.
 *
 * Derived from :func:`filtersToApiQuery`, so the key is exactly the request: if
 * two filters produce the same API query they share a cache entry, and if the
 * query differs the key differs. History scope deliberately sends no period, so
 * every history scope shares one entry, as it should.
 */
export function scopeKey(filters: DashboardFilters): string {
  const params = new URLSearchParams(filtersToApiQuery(filters));
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}
