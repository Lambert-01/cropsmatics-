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

export function useProductivity(filters: DashboardFilters, enabled = true) {
  return useQuery({
    queryKey: ["productivity", filters],
    queryFn: () => api.productivity(filters),
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useFactors(filters: DashboardFilters, enabled = Boolean(filters.crop)) {
  return useQuery({
    queryKey: ["factors", filters],
    queryFn: () => api.factors(filters),
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useHeatmap(filters: DashboardFilters, metric: "gap" | "yield" = "gap", enabled = true) {
  return useQuery({
    queryKey: ["heatmap", filters, metric],
    queryFn: () => api.heatmap(filters, metric),
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useMapMetrics(filters: DashboardFilters, metric: string, enabled = true) {
  return useQuery({
    queryKey: ["map-metrics", filters, metric],
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
    queryKey: ["post-harvest", filters],
    queryFn: () => api.postHarvest(filters),
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
    queryKey: ["priorities", filters, limit],
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
