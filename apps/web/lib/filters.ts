/**
 * The central dashboard filter model. Filters live in the URL so every view is
 * shareable and every change requeries the API (no in-browser analytics).
 */

export interface DashboardFilters {
  year?: number;
  season?: string;
  crop?: string;
  province?: string;
  district?: string;
  benchmark?: string;
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
  const yearRaw = params.get("year");
  return {
    year: yearRaw ? Number(yearRaw) : undefined,
    season: params.get("season") ?? undefined,
    crop: params.get("crop") ?? undefined,
    province: params.get("province") ?? undefined,
    district: params.get("district") ?? undefined,
    benchmark: params.get("benchmark") ?? DEFAULT_BENCHMARK,
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
  if (filters.year) params.set("year", String(filters.year));
  if (filters.season) params.set("season", filters.season);
  if (filters.crop) params.set("crop", filters.crop);
  if (filters.province) params.set("province", filters.province);
  if (filters.district) params.set("district", filters.district);
  if (filters.benchmark && filters.benchmark !== DEFAULT_BENCHMARK) {
    params.set("benchmark", filters.benchmark);
  }
  return params.toString();
}

/** Build the API query string (always includes the benchmark strategy). */
export function filtersToApiQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", String(filters.year));
  if (filters.season) params.set("season", filters.season);
  if (filters.crop) params.set("crop", filters.crop);
  if (filters.province) params.set("province", filters.province);
  if (filters.district) params.set("district", filters.district);
  params.set("benchmark_strategy", filters.benchmark ?? DEFAULT_BENCHMARK);
  return params.toString();
}
