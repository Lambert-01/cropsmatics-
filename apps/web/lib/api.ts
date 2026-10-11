import { filtersToApiQuery, type DashboardFilters } from "@/lib/filters";
import type {
  AllocationRequest,
  AllocationResponse,
  AssistantContext,
  AssistantResponse,
  CoverageResponse,
  Crop,
  DatasetInfo,
  DatasetResponse,
  DataVersionResponse,
  District,
  DistrictSummaryResponse,
  FacilitiesResponse,
  FactorsResponse,
  HeatmapResponse,
  MapMetricsResponse,
  MarketDispersionGroup,
  MarketObservation,
  MarketStatus,
  MarketTrendSeries,
  ModelsResponse,
  OverviewResponse,
  PeriodTrendResponse,
  PeriodsResponse,
  PostHarvestResponse,
  PriorityResponse,
  PriorityScenarioRequest,
  PriorityScenarioResponse,
  ProductivityResponse,
  ReadinessResponse,
  ReportCatalogEntry,
  ScenarioRequest,
  ScenarioResponse,
  SensitivityRequest,
  SensitivityResponse,
  SourcesResponse,
  StorageInfrastructureResponse,
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
  weightedPriorityMap: (filters: DashboardFilters, weights: Record<string, number>) =>
    post<MapMetricsResponse>("/maps/district-metrics", weights, filtersToApiQuery(filters)),
  trends: (crop?: string, compare?: string) => {
    const params = new URLSearchParams();
    if (crop) params.set("crop", crop);
    if (compare) params.set("compare", compare);
    return get<TrendResponse>("/analytics/trends", params.toString());
  },
  inputAdoption: () => get<TrendResponse>("/analytics/input-adoption"),
  // The backend only applies `crop` here (national crop-level dataset);
  // district/province travel along as explicit no-ops so the page can state
  // that the dataset does not support district granularity.
  postHarvest: (filters?: DashboardFilters) => {
    const params = new URLSearchParams();
    if (filters?.crop) params.set("crop", filters.crop);
    return get<PostHarvestResponse>("/analytics/post-harvest", params.toString());
  },
  storageInfrastructure: () =>
    get<StorageInfrastructureResponse>("/analytics/storage-infrastructure"),
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
  /** The published period dimension, derived from the data (never hard-coded). */
  periods: () => get<PeriodsResponse>("/meta/periods"),
  sources: () => get<SourcesResponse>("/meta/sources"),
  models: () => get<ModelsResponse>("/meta/models"),
  dataVersion: () => get<DataVersionResponse>("/meta/data-version"),
  readiness: () => get<ReadinessResponse>("/health/readiness"),

  algorithms: () =>
    get<{
      benchmark_strategies: { id: string; label: string }[];
      priority_weights: Record<string, number>;
      proxies: string[];
      high_gap_threshold_pct: number;
    }>("/meta/algorithms"),

  datasets: () => get<{ datasets: DatasetInfo[] }>("/meta/dataset"),
  dataset: (
    key: string,
    limit = 100,
    offset = 0,
    search = "",
    filters?: Record<string, string>,
    sortBy?: string | null,
    sortDir: "asc" | "desc" = "asc",
  ) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    Object.entries(filters ?? {}).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
    }
    return get<DatasetResponse>(`/meta/dataset/${key}`, params.toString());
  },
  districtSummary: (district: string, filters?: DashboardFilters) => {
    const params = new URLSearchParams({ district });
    if (filters) new URLSearchParams(filtersToApiQuery(filters)).forEach((v, k) => params.set(k, v));
    return get<DistrictSummaryResponse>("/reports/district-summary", params.toString());
  },
  /**
   * The backend report catalogue. Drives the Reports workspace so the list of
   * available exports has exactly one definition, on the server.
   */
  reportCatalog: () => get<{ reports: ReportCatalogEntry[] }>("/reports/catalog"),
  storageAllocation: (body: AllocationRequest) =>
    post<AllocationResponse>("/optimization/storage-allocation", body),

  /**
   * Grounded explanation layer. ``context`` names the page's selection so a
   * contextual action is answered from the same period/crop/district the user is
   * viewing instead of the default release. It carries entities only, never a
   * value, so it cannot inject a figure into an answer.
   */
  assistant: (
    question: string,
    language = "en",
    context?: AssistantContext,
    conversationId?: string,
  ) =>
    post<AssistantResponse>("/assistant/query", {
      question,
      language,
      context,
      // Sending the conversation id lets a follow-up ("and beans?", "compare
      // them") inherit the previous turn's entities instead of being read in
      // isolation. Omitted when there is none, so a stateless ask is unchanged.
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),

  /** Canonical period-aware panel: one crop across published periods. */
  productivityTrend: (crop: string, district?: string, season?: string) => {
    const params = new URLSearchParams({ crop });
    if (district) params.set("district", district);
    if (season) params.set("season", season);
    return get<PeriodTrendResponse>("/productivity/trend", params.toString());
  },

  /**
   * Yield Scenario Lab. Re-computes published observations under two sets of
   * assumptions. It is a POST because a scenario has six parameters, but it
   * writes nothing — and it never returns a prediction.
   */
  scenario: (body: ScenarioRequest) =>
    post<ScenarioResponse>("/scenarios/yield", body),

  /**
   * Intervention Priority Scenario Lab. Re-ranks the published district x crop
   * candidates under two sets of reviewable planning weights. It writes nothing
   * and never returns a budget or an intervention outcome.
   */
  priorityScenario: (body: PriorityScenarioRequest) =>
    post<PriorityScenarioResponse>("/scenarios/priority", body),

  /**
   * Ranking sensitivity. Re-ranks the same candidates under a reproducible sweep
   * of plausible weightings; the reported share is a robustness share, not a
   * probability.
   */
  sensitivity: (body: SensitivityRequest) =>
    post<SensitivityResponse>("/scenarios/sensitivity", body),

  /**
   * Market Intelligence. With no verified price feed loaded these answer
   * honestly with `data_available: false` and a reason — they never return a
   * sample price. Price types are always returned separately.
   */
  marketStatus: () => get<MarketStatus>("/markets/status"),
  marketCommodities: () =>
    get<{
      data_available: boolean;
      commodities: { commodity: string; commodity_code?: string | null; observations: number; price_types: string[]; markets: number }[];
      reason: string | null;
    }>("/markets/commodities"),
  marketCoverage: () => get<Record<string, unknown>>("/markets/coverage"),
  marketObservations: (params: Record<string, string> = {}) =>
    get<{ data_available: boolean; total: number; rows: MarketObservation[]; reason: string | null }>(
      "/markets/observations",
      new URLSearchParams(params).toString(),
    ),
  marketLatest: (params: Record<string, string> = {}) =>
    get<{ data_available: boolean; rows: MarketObservation[]; note: string; reason: string | null }>(
      "/markets/latest",
      new URLSearchParams(params).toString(),
    ),
  marketTrend: (commodity: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams({ commodity, ...params });
    return get<{
      commodity: string;
      data_available: boolean;
      series: MarketTrendSeries[];
      note: string;
      reason: string | null;
    }>("/markets/trend", query.toString());
  },
  marketDispersion: (commodity: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams({ commodity, ...params });
    return get<{
      commodity: string;
      data_available: boolean;
      groups: MarketDispersionGroup[];
      note: string;
      reason: string | null;
    }>("/markets/dispersion", query.toString());
  },
};

/**
 * Build a download URL for a Python-generated report.
 *
 * Accepts either a bare path (`/yield-gaps.csv`) or a full report endpoint from
 * the catalogue (`/reports/yield-gaps.csv`), so a caller cannot produce a
 * doubled prefix by passing the value the API itself returned.
 */
export function reportUrl(
  endpoint: string,
  filters?: DashboardFilters,
  format: "csv" | "json" = "csv",
): string {
  const path = endpoint.startsWith("/reports") ? endpoint : `/reports${endpoint}`;
  const params = new URLSearchParams(filters ? filtersToApiQuery(filters) : "");
  if (format === "json") params.set("format", "json");
  const qs = params.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}
