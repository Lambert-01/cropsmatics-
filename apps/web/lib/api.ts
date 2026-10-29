import { ApiFailure, describeApiFailure, readErrorBody } from "@/lib/apiError";
import { ApiConfigError, apiUrl } from "@/lib/apiUrl";
import { filtersToApiQuery, type DashboardFilters } from "@/lib/filters";
import { forecastQuery } from "@/lib/forecast";
import type {
  AllocationRequest,
  AllocationResponse,
  AssistantContext,
  AssistantResponse,
  CanonicalTrendResponse,
  CoverageResponse,
  Crop,
  DatasetInfo,
  DatasetResponse,
  OriginalSourceListResponse,
  OriginalSourceResponse,
  DataVersionResponse,
  District,
  DistrictSummaryResponse,
  FacilitiesResponse,
  FieldObservationsResponse,
  FactorsResponse,
  FertilizerSourceResponse,
  ForecastStatusResponse,
  HeatmapResponse,
  MapMetricsResponse,
  MarketDispersionGroup,
  ManualProjectionRequest,
  ManualProjectionResponse,
  MarketObservation,
  MarketStatus,
  MarketTrendSeries,
  ModelsResponse,
  NationalBoardResponse,
  OverviewResponse,
  PeriodTrendResponse,
  PeriodsResponse,
  PostharvestHistoryResponse,
  PostHarvestResponse,
  PracticeIndicatorResponse,
  PriorityResponse,
  PriorityScenarioRequest,
  PriorityScenarioResponse,
  ProductivityResponse,
  ProjectionMetric,
  ProjectionMethod,
  ProjectionOriginsResponse,
  ReadinessResponse,
  ReportCatalogEntry,
  ScenarioRequest,
  ScenarioResponse,
  SensitivityRequest,
  SensitivityResponse,
  SourcesResponse,
  StorageInfrastructureResponse,
  TrendResponse,
  WeatherContextResponse,
} from "@/types";

/**
 * How long a single analytical request may take before it is abandoned.
 *
 * A Render free instance waking from idle answers in a few seconds; a request
 * that has not answered in 30 s is not going to, and waiting on it holds a panel
 * in a loading state with no way out. The bound is deliberately above the
 * observed cold start (~3.8 s for the readiness probe) so a waking service is
 * not cut off.
 */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Turn an unresolvable base URL into the same typed failure a panel already
 * knows how to render, so a configuration error is a recoverable state rather
 * than a crash inside a fetch call or a blank screen.
 *
 * Emphatically *not* a silent fallback to localhost: substituting a host the
 * user did not configure is how a configuration error becomes a phantom outage.
 */
function configFailure(path: string, error: unknown): ApiFailure {
  const detail = error instanceof ApiConfigError ? error.message : String(error);
  return new ApiFailure({
    path,
    status: null,
    code: "API_BASE_URL_INVALID",
    message: detail,
    retryable: false,
  });
}

/**
 * Turn an aborted/timed-out request into a typed failure.
 *
 * `status: null` is the same signal as an unreachable service, which is accurate:
 * nothing was served. It is retryable, because a cold start is.
 */
function timeoutFailure(path: string): ApiFailure {
  return new ApiFailure({
    path,
    status: null,
    code: "REQUEST_TIMEOUT",
    message:
      "The analytics service did not answer in time. Figures are unavailable rather " +
      "than shown from a partial response.",
    retryable: true,
  });
}

/**
 * One request, with a bounded timeout and typed failures for every way it can
 * fail before the server answers.
 *
 * `signal` is accepted so a caller (or a cancelled panel) can abort in flight;
 * the timeout is combined with it rather than replacing it, so neither the
 * caller's cancellation nor the deadline is silently ignored.
 */
async function request(
  path: string,
  init: RequestInit,
  qs = "",
): Promise<Response> {
  let url: string;
  try {
    url = apiUrl(path, qs);
  } catch (error) {
    throw configFailure(path, error);
  }

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    // A caller-initiated cancellation is not a service failure.
    if (init.signal?.aborted) throw error;
    if (timeout.aborted) throw timeoutFailure(path);
    throw error;
  }
}

/**
 * Turn a failed response into an error a panel can explain.
 *
 * The API's typed 503s (`DATASET_OUT_OF_SYNC`, `DATABASE_UNAVAILABLE`) carry the
 * real reason, so the message is built from the body rather than from the status
 * line. The original status and code stay on the object for the retry policy and
 * for the console, and the request path is kept only for that developer-facing
 * line - never for the text a reader sees.
 */
async function failure(path: string, res: Response): Promise<ApiFailure> {
  const body = await readErrorBody(res);
  const described = describeApiFailure(res.status, body, res.statusText, path);
  return new ApiFailure({
    path,
    status: res.status,
    code: body?.code ?? null,
    message: described.message,
    retryable: body?.retryable ?? described.retryable,
  });
}

async function get<T>(path: string, qs = "", signal?: AbortSignal): Promise<T> {
  const res = await request(path, { headers: { Accept: "application/json" }, signal }, qs);
  if (!res.ok) {
    throw await failure(path, res);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown, qs = "", signal?: AbortSignal): Promise<T> {
  const res = await request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    },
    qs,
  );
  if (!res.ok) {
    throw await failure(path, res);
  }
  return (await res.json()) as T;
}

/**
 * POST a body and save the response as a file, under the name the server
 * declared in `Content-Disposition` (a calculation id, not a browser guess).
 * Failures surface as a normal `ApiFailure`, so the caller can show the real
 * refusal instead of a download that silently produced nothing.
 */
async function download(path: string, body: unknown, fallbackName: string): Promise<void> {
  const res = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/csv" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await failure(path, res);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const href = URL.createObjectURL(await res.blob());
  try {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = match?.[1] ?? fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(href);
  }
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
  fieldObservations: (filters: DashboardFilters) =>
    get<FieldObservationsResponse>("/maps/field-observations", filtersToApiQuery(filters)),
  weightedPriorityMap: (filters: DashboardFilters, weights: Record<string, number>) =>
    post<MapMetricsResponse>("/maps/district-metrics", weights, filtersToApiQuery(filters)),
  /**
   * The whole national crop board in one read: every crop's series on one
   * shared period axis, with the same-season delta computed server-side.
   *
   * The scope travels to the server (never filtered in the client), so a
   * period-scoped board cannot mix a filtered value with an unfiltered change.
   */
  nationalBoard: (params?: { periodCode?: string; year?: number; season?: string }) => {
    const query = new URLSearchParams();
    if (params?.periodCode) query.set("period_code", params.periodCode);
    if (params?.year) query.set("year", String(params.year));
    if (params?.season) query.set("season", params.season);
    return get<NationalBoardResponse>("/analytics/national-board", query.toString());
  },
  trends: (crop?: string, compare?: string) => {
    const params = new URLSearchParams();
    if (crop) params.set("crop", crop);
    if (compare) params.set("compare", compare);
    return get<TrendResponse>("/analytics/trends", params.toString());
  },
  /**
   * The canonical multi-period trend (2022A-2026B) from the productivity panel.
   *
   * Distinct from `/analytics/trends`: one period axis, no release mixing, and
   * a period the release did not tabulate preserved as `null`. A district trend
   * requires a crop (the API rejects district-without-crop with a 422).
   */
  canonicalTrend: (crop?: string, district?: string) => {
    const params = new URLSearchParams();
    if (crop) params.set("crop", crop);
    if (district && crop) params.set("district", district);
    return get<CanonicalTrendResponse>("/analytics/canonical-trend", params.toString());
  },
  inputAdoption: () => get<TrendResponse>("/analytics/input-adoption"),
  fertilizerSource: (filters?: DashboardFilters) =>
    get<FertilizerSourceResponse>("/analytics/fertilizer-source", filtersToApiQuery(filters ?? {})),
  // The backend only applies `crop` here (national crop-level dataset);
  // district/province travel along as explicit no-ops so the page can state
  // that the dataset does not support district granularity.
  postHarvest: (filters?: DashboardFilters) => {
    const params = new URLSearchParams();
    if (filters?.crop) params.set("crop", filters.crop);
    return get<PostHarvestResponse>("/analytics/post-harvest", params.toString());
  },
  /**
   * Multi-period post-harvest use shares (2024A-2026B, 1,573 observations).
   *
   * The whole panel is requested in one call: the panel is small, and pivoting
   * between crops and releases client-side then never refetches, so a chart
   * cannot be torn down by a background request. The response still carries
   * `n_observations` and `periods` so the UI can state what it is showing.
   */
  postharvestHistory: (params?: { crop?: string; periodCode?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.crop) query.set("crop", params.crop);
    if (params?.periodCode) query.set("period_code", params.periodCode);
    query.set("limit", String(params?.limit ?? 2000));
    return get<PostharvestHistoryResponse>("/analytics/postharvest-history", query.toString());
  },
  /**
   * Multi-period practice / irrigation / water-source / erosion and district
   * fertilizer-source observations. Coverage is domain-specific.
   *
   * The district is requested rather than filtered here: one district's five
   * domains are ~306 rows, while the whole panel is 9,468 - far past the
   * endpoint's default slice. `n_observations` still reports the untruncated
   * count so a caller can tell a complete response from a capped one.
   */
  practiceIndicators: (params?: {
    district?: string;
    province?: string;
    domain?: string;
    periodCode?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.district) query.set("district", params.district);
    if (params?.province) query.set("province", params.province);
    if (params?.domain) query.set("domain", params.domain);
    if (params?.periodCode) query.set("period_code", params.periodCode);
    query.set("limit", String(params?.limit ?? 500));
    return get<PracticeIndicatorResponse>("/analytics/practice-indicators", query.toString());
  },
  storageInfrastructure: () =>
    get<StorageInfrastructureResponse>("/analytics/storage-infrastructure"),
  /**
   * The forecast publication decision (chronological backtest). Answers 200
   * even when no forecast may be served — the evidence verdict *is* the
   * answer — so a client can explain the absence instead of hiding it.
   */
  forecastStatus: (filters: DashboardFilters = {}) =>
    get<ForecastStatusResponse>("/analytics/forecast-status", forecastQuery(filters)),
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
  weatherContext: (districtCode: string) =>
    get<WeatherContextResponse>(
      "/context/weather",
      `district_code=${encodeURIComponent(districtCode)}`,
    ),
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
  originalSources: (params?: {
    release?: string;
    sourceId?: string;
    mapped?: boolean;
    availability?: "full extract" | "inventory only";
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.release) query.set("release", params.release);
    if (params?.sourceId) query.set("source_id", params.sourceId);
    if (params?.mapped !== undefined) query.set("mapped", String(params.mapped));
    if (params?.availability) query.set("availability", params.availability);
    if (params?.search) query.set("search", params.search);
    return get<OriginalSourceListResponse>("/meta/original-sources", query.toString());
  },
  originalSource: (key: string, limit = 100, offset = 0, search = "") => {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) query.set("search", search);
    return get<OriginalSourceResponse>(
      `/meta/original-sources/${encodeURIComponent(key)}`,
      query.toString(),
    );
  },
  originalSourceDownloadHref: (key: string) =>
    apiUrl(`/meta/original-sources/${encodeURIComponent(key)}/download`),
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
   * Manual projection ("Build a projection"). A stateless calculation from a
   * published observed baseline and the caller's explicit assumptions. It returns
   * a `planning_projection` — never an official statistic and never a validated
   * forecast — and it writes nothing. Python computes every number; the browser
   * sends only the specification.
   */
  manualProjection: (body: ManualProjectionRequest) =>
    post<ManualProjectionResponse>("/scenarios/manual-projection", body),

  /**
   * Origin options for the projection's origin selector: the periods with a
   * published same-season observation for this exact scope (or planning
   * periods for a personal plan without history), chronological, latest last —
   * the same list the calculation would accept, derived from the same panel.
   */
  projectionOrigins: (params: {
    crop: string;
    district?: string | null;
    season: "A" | "B" | "C";
    metric: ProjectionMetric;
    method: ProjectionMethod;
  }) => {
    const qs = new URLSearchParams({
      crop: params.crop,
      season: params.season,
      metric: params.metric,
      method: params.method,
    });
    if (params.district) qs.set("district", params.district);
    return get<ProjectionOriginsResponse>("/scenarios/manual-projection/origins", qs.toString());
  },

  /**
   * The Python-generated CSV of a manual projection: POST the same plan the
   * Calculate button sends, receive the identical calculation as a file whose
   * every row carries the plan's full context. The browser computes no
   * projection arithmetic at all.
   */
  manualProjectionCsv: (body: ManualProjectionRequest) =>
    download("/reports/manual-projection.csv", body, "manual-projection.csv"),

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
  return apiUrl(path, params.toString());
}

/** Build the shared server-generated PDF URL for a catalogue report. */
export function reportPdfUrl(reportKey: string, filters?: DashboardFilters): string {
  const params = new URLSearchParams(filters ? filtersToApiQuery(filters) : "");
  params.set("report_key", reportKey);
  return apiUrl("/reports/export.pdf", params.toString());
}
