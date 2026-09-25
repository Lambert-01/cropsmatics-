"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DashboardFilters } from "@/lib/filters";

/** Legacy hook kept for compatibility; prefer ``useProductivity``. */
export function useProductivityGap(strategy = "national_crop_median", limit = 50) {
  const filters: DashboardFilters = { benchmark: strategy };
  return useQuery({
    queryKey: ["productivity-gap", strategy, limit],
    queryFn: () => api.priorities(filters, limit),
  });
}
