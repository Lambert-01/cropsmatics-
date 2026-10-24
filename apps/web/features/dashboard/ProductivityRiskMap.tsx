"use client";

import { useState } from "react";

import { ErrorState, MapSkeleton } from "@/components/ui/States";
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
  const mapQuery = useMapMetrics(filters, metric);
  const { data, isLoading, isError, refetch } = mapQuery;
  const { data: facilities } = useFacilities();

  if (isError && !data) {
    return (
      <ErrorState
        message="The map metric could not be loaded for this selection."
        onRetry={() => void refetch()}
      />
    );
  }
  if (isLoading && !data) return <MapSkeleton height={height} />;

  return <div className="space-y-2">
    {isError ? (
      <ErrorState
        message="The latest map refresh failed; showing the last loaded metric."
        onRetry={() => void refetch()}
      />
    ) : null}
    <RwandaDistrictMap
      data={data}
      metric={metric}
      onMetricChange={setMetric}
      onSelectDistrict={onSelectDistrict}
      selectedDistrict={selectedDistrict}
      facilities={facilities?.facilities ?? []}
      height={height}
    />
  </div>;
}
