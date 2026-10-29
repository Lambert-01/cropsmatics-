"use client";

import { useState } from "react";

import { PageHeading } from "@/components/ui/PageHeading";
import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { ErrorState, MapSkeleton, UpdatingPill } from "@/components/ui/States";
import { CropEntryPoint } from "@/features/crops/CropEntryPoint";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import type { MapMetricId } from "@/lib/constants";
import { useFacilities, useMapMetrics, useProductivity } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

export default function MapsPage() {
  const { filters, setFilters } = useFilters();
  const [metric, setMetric] = useState<MapMetricId>("production");
  const mapMetrics = useMapMetrics(filters, metric);
  const facilities = useFacilities();
  const productivity = useProductivity(filters);

  return (
    <div className="space-y-5">
      <PageHeading
        title="Rwanda Maps"
        subtitle="Explore district-level productivity, gap and adoption across the country."
      />

      <AnalyticsFilterBar
        supported={["period", "crop", "province", "district", "benchmark"]}
        coverageLabel="MAP VALUES FOLLOW THESE FILTERS"
      />

      <div className="px-1">
        <CropEntryPoint crop={filters.crop} />
      </div>

      {mapMetrics.isError && !mapMetrics.data ? (
        <ErrorState
          message="The map metric could not be loaded for this selection."
          onRetry={() => void mapMetrics.refetch()}
        />
      ) : mapMetrics.isLoading && !mapMetrics.data ? (
        <MapSkeleton height={560} />
      ) : (
        <div className="space-y-2">
          <div className="flex min-h-5 items-center justify-end">
            <UpdatingPill active={mapMetrics.isFetching && Boolean(mapMetrics.data)} />
          </div>
          <RwandaDistrictMap
            data={mapMetrics.data}
            metric={metric}
            onMetricChange={setMetric}
            selectedDistrict={filters.district}
            onSelectDistrict={(d) =>
              setFilters({ district: filters.district === d ? undefined : d })
            }
            facilities={facilities.data?.facilities ?? []}
            height={560}
            title="District choropleth explorer"
          />
        </div>
      )}

      <DistrictRankingTable
        rows={productivity.data?.rows ?? []}
        onSelectDistrict={(d) => setFilters({ district: d })}
      />
    </div>
  );
}
