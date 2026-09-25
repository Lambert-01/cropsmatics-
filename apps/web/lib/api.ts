import { filtersToApiQuery, type DashboardFilters } from "@/lib/filters";
import type {
  AllocationRequest,
  AllocationResponse,
  CoverageResponse,
  Crop,
  DatasetInfo,
  DatasetResponse,
  District,
  FacilitiesResponse,
  FactorsResponse,
  HeatmapResponse,
  MapMetricsResponse,
  ModelsResponse,
  OverviewResponse,
  PostHarvestResponse,
  PriorityResponse,
  ProductivityResponse,
  SourcesResponse,
  TrendResponse,
} from "@/types";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function get<T>(path: string, qs = ""): Promise<T> {
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown, qs = ""): Promise<T> {
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  districts: () => get<District[]>("/geography/districts"),
  crops: () => get<Crop[]>("/crops"),

  overview: (filters: DashboardFilters) =>
    get<OverviewResponse>("/dashboard/overview", filtersToApiQuery(filters)),
  productivity: (filters: DashboardFilters) =>
    get<ProductivityResponse>("/analytics/productivity", filtersToApiQuery(filters)),
  factors: (filters: DashboardFilters) =>
    get<FactorsResponse>("/analytics/factors", filtersToApiQuery(filters)),
  heatmap: (filters: DashboardFilters, metric: "gap" | "yield" = "gap") =>
    get<HeatmapResponse>(
      "/analytics/heatmap",
      `${filtersToApiQuery(filters)}&metric=${metric}`,
    ),
  mapDistrictMetrics: (
    filters: DashboardFilters,
    metric: string,
  ) => get<MapMetricsResponse>("/maps/district-metrics", `${filtersToApiQuery(filters)}&metric=${metric}`),
  trends: (crop?: string) => get<TrendResponse>("/analytics/trends", crop ? `crop=${encodeURIComponent(crop)}` : ""),
  inputAdoption: () => get<TrendResponse>("/analytics/input-adoption"),
  postHarvest: () => get<PostHarvestResponse>("/analytics/post-harvest"),
  priorities: (filters: DashboardFilters, limit = 50) =>
    get<PriorityResponse>(
      "/analytics/intervention-priorities",
      `${filtersToApiQuery(filters)}&limit=${limit}`,
    ),
  prioritiesWeighted: (
    filters: DashboardFilters,
    weights: Record<string, number>,
    limit = 50,
  ) =>
    post<PriorityResponse>(
      "/analytics/intervention-priorities",
      { weights, limit },
      filtersToApiQuery(filters),
    ),
  facilities: (district?: string) =>
    get<FacilitiesResponse>("/facilities/context", district ? `district=${encodeURIComponent(district)}` : ""),
  coverage: () => get<CoverageResponse>("/meta/data-coverage"),
  sources: () => get<SourcesResponse>("/meta/sources"),
  models: () => get<ModelsResponse>("/meta/models"),

  algorithms: () =>
    get<{
      benchmark_strategies: { id: string; label: string }[];
      priority_weights: Record<string, number>;
      proxies: string[];
      high_gap_threshold_pct: number;
    }>("/meta/algorithms"),

  datasets: () => get<{ datasets: DatasetInfo[] }>("/meta/dataset"),
  dataset: (key: string, limit = 100, offset = 0, search = "") => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    return get<DatasetResponse>(`/meta/dataset/${key}`, params.toString());
  },
  districtSummary: (district: string) =>
    get<{ district: string; crops: Record<string, unknown>[] }>(
      "/reports/district-summary",
      `district=${encodeURIComponent(district)}`,
    ),
  storageAllocation: (body: AllocationRequest) =>
    post<AllocationResponse>("/optimization/storage-allocation", body),

  assistant: (question: string, language = "en") =>
    post<{ answer: string; grounded: boolean; evidence: Record<string, unknown>; limitations: string[] }>(
      "/assistant/query",
      { question, language },
    ),
};

/** Build a CSV download URL for a Python-generated report. */
export function reportUrl(path: string, filters?: DashboardFilters): string {
  const qs = filters ? filtersToApiQuery(filters) : "";
  return `${BASE_URL}/reports${path}${qs ? `?${qs}` : ""}`;
}
