/**
 * The central dashboard filter model. Filters live in the URL so every view is
 * shareable and every change requeries the API (no in-browser analytics).
 */

export interface DashboardFilters {
  /**
   * Canonical period code (``2026B``), read from ``/meta/periods``.
   *
   * This is the period selector of record: when it is set the API receives
   * ``period_code`` and the legacy ``year``/``season`` pair is derived from it
   * so both the canonical and the legacy endpoints select the same release.
   */
  period?: string;
  /** Legacy year/season pair, still supported for older shared links. */
  year?: number;
  season?: string;
  crop?: string;
  province?: string;
  district?: string;
  benchmark?: string;
  /** Optional 2-5 crop comparison for national trends (comma-joined in URL). */
  compare?: string;
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
  { value: "national_crop_median", label: "National crop median" },
  { value: "national_crop_season_median", label: "National crop-season median" },
  { value: "top_quartile_comparable_districts", label: "Top-quartile comparable districts" },
  { value: "agro_ecological_peer_group", label: "Agro-ecological peer group" },
] as const;

export const DEFAULT_BENCHMARK = "national_crop_median";

/** Read filters from a URLSearchParams-like record. */
export function parseFilters(params: URLSearchParams | { get(key: string): string | null }): DashboardFilters {
  const period = params.get("period") ?? undefined;
  const yearRaw = params.get("year");
  return {
    period,
    year: yearRaw ? Number(yearRaw) : undefined,
    season: params.get("season") ?? undefined,
    crop: params.get("crop") ?? undefined,
    province: params.get("province") ?? undefined,
    district: params.get("district") ?? undefined,
    benchmark: params.get("benchmark") ?? DEFAULT_BENCHMARK,
    compare: params.get("compare") ?? undefined,
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
  return params.toString();
}

/**
 * Build the API query string (always includes the benchmark strategy).
 *
 * A canonical ``period`` is sent as ``period_code`` together with its derived
 * ``year``/``season`` so that period-aware endpoints (dashboard, analytics,
 * maps) and legacy year/season endpoints select the same release.
 */
export function filtersToApiQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.period) {
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
