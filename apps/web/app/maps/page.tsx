"use client";

import { useState } from "react";

import { PageHeading } from "@/components/ui/PageHeading";
import { MapSkeleton } from "@/components/ui/States";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import type { MapMetricId } from "@/lib/constants";
import { useFacilities, useMapMetrics, useProductivity } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

export default function MapsPage() {
  const { filters, setFilters } = useFilters();
  const [metric, setMetric] = useState<MapMetricId>("gap");
  const mapMetrics = useMapMetrics(filters, metric);
  const facilities = useFacilities();
  const productivity = useProductivity(filters);

  return (
    <div className="space-y-5">
      <PageHeading
        title="Rwanda Maps"
        subtitle="Explore district-level productivity, gap and adoption across the country."
      />

      {mapMetrics.isLoading ? (
        <MapSkeleton height={560} />
      ) : (
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
      )}

      <DistrictRankingTable
        rows={productivity.data?.rows ?? []}
        onSelectDistrict={(d) => setFilters({ district: d })}
      />
    </div>
  );
}
