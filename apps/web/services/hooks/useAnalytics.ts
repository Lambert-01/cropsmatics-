"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DashboardFilters } from "@/lib/filters";

const FIVE_MIN = 5 * 60 * 1000;

export function useOverview(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["overview", filters],
    queryFn: () => api.overview(filters),
    staleTime: FIVE_MIN,
  });
}

export function useProductivity(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["productivity", filters],
    queryFn: () => api.productivity(filters),
    staleTime: FIVE_MIN,
  });
}

export function useFactors(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["factors", filters],
    queryFn: () => api.factors(filters),
    staleTime: FIVE_MIN,
  });
}

export function useHeatmap(filters: DashboardFilters, metric: "gap" | "yield" = "gap") {
  return useQuery({
    queryKey: ["heatmap", filters, metric],
    queryFn: () => api.heatmap(filters, metric),
    staleTime: FIVE_MIN,
  });
}

export function useMapMetrics(filters: DashboardFilters, metric: string) {
  return useQuery({
    queryKey: ["map-metrics", filters, metric],
    queryFn: () => api.mapDistrictMetrics(filters, metric),
    staleTime: FIVE_MIN,
  });
}

export function useTrends(crop?: string) {
  return useQuery({
    queryKey: ["trends", crop ?? "national"],
    queryFn: () => api.trends(crop),
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

export function usePostHarvest() {
  return useQuery({
    queryKey: ["post-harvest"],
    queryFn: () => api.postHarvest(),
    staleTime: FIVE_MIN,
  });
}

export function usePriorities(filters: DashboardFilters, limit = 50) {
  return useQuery({
    queryKey: ["priorities", filters, limit],
    queryFn: () => api.priorities(filters, limit),
    staleTime: FIVE_MIN,
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
