"use client";

import { useState } from "react";

import { PageHero } from "@/components/layout/PageHero";
import { EmptyState, ErrorState, MapSkeleton } from "@/components/ui/States";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import { FacilityStatus } from "@/features/storage/FacilityStatus";
import { OptimizationDemo } from "@/features/storage/OptimizationDemo";
import type { MapMetricId } from "@/lib/constants";
import { useFacilities, useMapMetrics } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

export default function StoragePage() {
  const { filters } = useFilters();
  const [metric, setMetric] = useState<MapMetricId>("input_adoption");
  const mapMetrics = useMapMetrics(filters, metric);
  const facilities = useFacilities(filters.district);

  return (
    <div className="space-y-5">
      <PageHero
        title="Storage & Aggregation"
        subtitle="Verified cold-chain program context, honest capacity reporting, and an OR-Tools allocation demo."
      />

      <div className="card border-amber/25 bg-amber/[0.05] p-4">
        <h2 className="text-sm font-semibold text-amber">No verified capacity is assumed</h2>
        <p className="mt-1 text-xs text-slate-700">
          The public cold-chain announcement names program districts but publishes neither facility
          coordinates nor capacities. Cropmatics therefore shows <strong>Capacity not verified</strong>{" "}
          rather than inventing a number, and excludes such facilities from optimization.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        {mapMetrics.isLoading ? (
          <MapSkeleton />
        ) : (
          <RwandaDistrictMap
            data={mapMetrics.data}
            metric={metric}
            onMetricChange={setMetric}
            facilities={facilities.data?.facilities ?? []}
          />
        )}
        <div className="space-y-5">
          {facilities.error ? (
            <ErrorState
              message={(facilities.error as Error).message}
              onRetry={() => facilities.refetch()}
            />
          ) : (
            <FacilityStatus data={facilities.data} />
          )}
          {(facilities.data?.facilities ?? []).length === 0 && !facilities.isLoading ? (
            <EmptyState
              title="No verified program districts for this selection."
              hint="Clear the district filter to see all program districts."
            />
          ) : null}
        </div>
      </div>

      <OptimizationDemo />
    </div>
  );
}
