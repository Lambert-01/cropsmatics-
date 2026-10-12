"use client";

import { useState } from "react";

import { MapSkeleton } from "@/components/ui/States";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import type { MapMetricId } from "@/lib/constants";
import { useFacilities } from "@/services/hooks/useAnalytics";
import { useMapMetrics } from "@/services/hooks/useAnalytics";
import type { DashboardFilters } from "@/lib/filters";

export function ProductivityRiskMap({
  filters,
  onSelectDistrict,
  selectedDistrict,
  height = 460,
}: {
  filters: DashboardFilters;
  onSelectDistrict?: (district: string) => void;
  selectedDistrict?: string | null;
  height?: number;
}) {
  // Production works for every crop selection (and for none), so the overview
  // map renders before a crop is chosen.
  const [metric, setMetric] = useState<MapMetricId>("production");
  const { data, isLoading } = useMapMetrics(filters, metric);
  const { data: facilities } = useFacilities();

  if (isLoading) return <MapSkeleton height={height} />;

  return (
    <RwandaDistrictMap
      data={data}
      metric={metric}
      onMetricChange={setMetric}
      onSelectDistrict={onSelectDistrict}
      selectedDistrict={selectedDistrict}
      facilities={facilities?.facilities ?? []}
      height={height}
    />
  );
}
