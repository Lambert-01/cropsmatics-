"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export function useProductivityGap(strategy = "national_crop_median", limit = 50) {
  return useQuery({
    queryKey: ["productivity-gap", strategy, limit],
    queryFn: () => api.productivityGap(strategy, limit),
  });
}
