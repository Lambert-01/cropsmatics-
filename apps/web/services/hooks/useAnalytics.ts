"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { scopeKey, type DashboardFilters } from "@/lib/filters";
import type {
  AssistantContext,
  PriorityScenarioRequest,
  ScenarioRequest,
  SensitivityRequest,
} from "@/types";

const FIVE_MIN = 5 * 60 * 1000;

/**
 * Every analytical query is keyed on the scope identity, never on the filter
 * object. Two filters that issue the same API request therefore share one cache
 * entry instead of the second one being treated as a new scope - which is what
 * used to tear down an already-rendered chart and refetch it. See `scopeKey`.
 */
export function useOverview(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["overview", scopeKey(filters)],
    queryFn: () => api.overview(filters),
    staleTime: FIVE_MIN,
  });
}

export function useProductivity(filters: DashboardFilters, enabled = true) {
  return useQuery({
    queryKey: ["productivity", scopeKey(filters)],
    queryFn: () => api.productivity(filters),
    staleTime: FIVE_MIN,
    enabled,
  });
}

/**
 * The productivity panel forced to one explicit period code.
 *
 * Used by the two-period district change view: it needs the same district/crop
 * selection measured against two different releases, so the canonical `period`
 * is pinned here and any derived `year`/`season` on the current filters is
 * dropped — otherwise the stale pair would win and both panels would resolve to
 * the same release, silently erasing the comparison.
 */
export function useProductivityAtPeriod(
  filters: DashboardFilters,
  periodCode: string | undefined,
  enabled = true,
) {
  const pinned: DashboardFilters = { ...filters, period: periodCode, year: undefined, season: undefined };
  return useQuery({
    queryKey: ["productivity-at", scopeKey(pinned)],
    queryFn: () => api.productivity(pinned),
    staleTime: FIVE_MIN,
    enabled: enabled && Boolean(periodCode),
  });
}

/**
 * One crop across every published period, from the canonical panel. Used by the
 * Yield Intelligence trend, where `season` restricts the series to a single
 * season so it reads as a same-season year-on-year comparison.
 */
export function useProductivityTrend(
  crop?: string,
  district?: string,
  season?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["productivity-trend", crop ?? "", district ?? "", season ?? ""],
    queryFn: () => api.productivityTrend(crop as string, district, season),
    staleTime: FIVE_MIN,
    enabled: enabled && Boolean(crop),
  });
}

/**
 * Grounded assistant. The page context names the current selection so the
 * explanation is retrieved for the same period/crop/district being viewed.
 */
export function useAssistantMutation() {
  return useMutation({
    mutationFn: ({
      question,
      context,
      language = "en",
    }: {
      question: string;
      context?: AssistantContext;
      language?: string;
    }) => api.assistant(question, language, context),
  });
}

/**
 * Analytical yield scenario. Exposed as a mutation rather than a query because it
 * is only run on an explicit "Run scenario" action, so the page never recomputes
 * a comparison the user has not asked for.
 */
export function useScenario() {
  return useMutation({
    mutationFn: (body: ScenarioRequest) => api.scenario(body),
  });
}

/**
 * Priority scenario. A mutation for the same reason as the yield scenario: the
 * comparison is only computed when the planner asks for it.
 */
export function usePriorityScenario() {
  return useMutation({
    mutationFn: (body: PriorityScenarioRequest) => api.priorityScenario(body),
  });
}

/**
 * Ranking sensitivity sweep. A mutation because it is an explicit "test the
 * ranking's robustness" action over a chosen number of draws.
 */
export function useSensitivity() {
  return useMutation({
    mutationFn: (body: SensitivityRequest) => api.sensitivity(body),
  });
}

export function useFactors(filters: DashboardFilters, enabled = Boolean(filters.crop)) {
  return useQuery({
    queryKey: ["factors", scopeKey(filters)],
    queryFn: () => api.factors(filters),
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useHeatmap(filters: DashboardFilters, metric: "gap" | "yield" = "gap", enabled = true) {
  return useQuery({
    queryKey: ["heatmap", scopeKey(filters), metric],
    queryFn: () => api.heatmap(filters, metric),
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useMapMetrics(filters: DashboardFilters, metric: string, enabled = true) {
  return useQuery({
    queryKey: ["map-metrics", scopeKey(filters), metric],
    queryFn: () => api.mapDistrictMetrics(filters, metric),
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useWeightedPriorityMap(filters: DashboardFilters) {
  return useMutation({
    mutationFn: (weights: Record<string, number>) => api.weightedPriorityMap(filters, weights),
  });
}

export function useTrends(crop?: string, compare?: string) {
  return useQuery({
    queryKey: ["trends", crop ?? "national", compare ?? ""],
    queryFn: () => api.trends(crop, compare),
    staleTime: FIVE_MIN,
  });
}

export function useInputAdoption() {
  return useQuery({
    queryKey: ["input-adoption"],
    queryFn: () => api.inputAdoption(),
    staleTime: FIVE_MIN,
  });
}

/**
 * National crop-level post-harvest shares. Only `crop` has an effect on the
 * API; district/province are deliberately sent as no-ops — the endpoint never
 * fabricates district granularity, and the page must say so explicitly.
 */
export function usePostHarvest(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["post-harvest", scopeKey(filters)],
    queryFn: () => api.postHarvest(filters),
    staleTime: FIVE_MIN,
  });
}

/**
 * The multi-period post-harvest panel, fetched whole and once.
 *
 * Keyed on the request, not on the page's crop/period selection: those are
 * applied client-side by `lib/postharvestHistory`, so changing crop or release
 * re-renders from cache instead of issuing a request that could land after a
 * slower one and blank the chart.
 */
export function usePostharvestHistory() {
  return useQuery({
    queryKey: ["postharvest-history", 2000],
    queryFn: () => api.postharvestHistory({ limit: 2000 }),
    staleTime: FIVE_MIN,
  });
}

/**
 * National MINAGRI infrastructure totals + cold-chain program context.
 * National/program level only, so it is not filter-dependent.
 */
export function useStorageInfrastructure() {
  return useQuery({
    queryKey: ["storage-infrastructure"],
    queryFn: () => api.storageInfrastructure(),
    staleTime: FIVE_MIN,
  });
}

export function usePriorities(filters: DashboardFilters, limit = 50, enabled = true) {
  return useQuery({
    queryKey: ["priorities", scopeKey(filters), limit],
    queryFn: () => api.priorities(filters, limit),
    staleTime: FIVE_MIN,
    enabled,
  });
}

/** Recompute priorities with user-adjusted weights on the server. */
export function useWeightedPriorities(filters: DashboardFilters) {
  return useMutation({
    mutationFn: (weights: Record<string, number>) => api.prioritiesWeighted(filters, weights),
  });
}

export function useFacilities(district?: string) {
  return useQuery({
    queryKey: ["facilities", district ?? "all"],
    queryFn: () => api.facilities(district),
    staleTime: FIVE_MIN,
  });
}

/**
 * Multi-period agricultural practice indicators.
 *
 * Scoped by district when provided — the full panel is 9,468 rows, so a
 * district scope keeps the response to ~306 rows. `n_observations` in the
 * response still reports the untruncated count so callers can detect a capped
 * response. Domain is optional; omitting it returns all five domains.
 */
export function usePracticeIndicators(params?: {
  district?: string;
  province?: string;
  domain?: string;
  periodCode?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["practice-indicators", params?.district ?? "", params?.domain ?? "", params?.periodCode ?? ""],
    queryFn: () => api.practiceIndicators(params),
    staleTime: FIVE_MIN,
  });
}
