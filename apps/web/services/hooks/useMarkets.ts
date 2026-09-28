"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

const FIVE_MIN = 5 * 60 * 1000;

/**
 * Market availability. `data_available: false` is an expected, honest state, so
 * the page treats it as a normal result rather than an error.
 */
export function useMarketStatus() {
  return useQuery({
    queryKey: ["market-status"],
    queryFn: api.marketStatus,
    staleTime: FIVE_MIN,
  });
}

export function useMarketCommodities(enabled = true) {
  return useQuery({
    queryKey: ["market-commodities"],
    queryFn: api.marketCommodities,
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useMarketCoverage() {
  return useQuery({
    queryKey: ["market-coverage"],
    queryFn: api.marketCoverage,
    staleTime: FIVE_MIN,
  });
}

/** Only fetched once the status says observations exist. */
export function useMarketLatest(enabled = true, params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ["market-latest", params],
    queryFn: () => api.marketLatest(params),
    staleTime: FIVE_MIN,
    enabled,
  });
}

export function useMarketTrend(commodity?: string, params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ["market-trend", commodity ?? "", params],
    queryFn: () => api.marketTrend(commodity as string, params),
    staleTime: FIVE_MIN,
    enabled: Boolean(commodity),
  });
}

export function useMarketDispersion(commodity?: string, params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ["market-dispersion", commodity ?? "", params],
    queryFn: () => api.marketDispersion(commodity as string, params),
    staleTime: FIVE_MIN,
    enabled: Boolean(commodity),
  });
}
