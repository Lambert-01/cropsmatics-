"use client";

import { useState } from "react";

import { PageHero } from "@/components/layout/PageHero";
import { DataBadge } from "@/components/ui/DataBadge";
import { EmptyState, ErrorState, MapSkeleton } from "@/components/ui/States";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import { ColdChainProgramPanel } from "@/features/storage/ColdChainProgramPanel";
import { FacilityStatus } from "@/features/storage/FacilityStatus";
import { NationalInfrastructureSummary } from "@/features/storage/NationalInfrastructureSummary";
import { OptimizationDemo } from "@/features/storage/OptimizationDemo";
import type { MapMetricId } from "@/lib/constants";
import { useFacilities, useMapMetrics, useStorageInfrastructure } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

export default function StoragePage() {
  const { filters } = useFilters();
  const [metric, setMetric] = useState<MapMetricId>("input_adoption");
  const mapMetrics = useMapMetrics(filters, metric);
  const facilities = useFacilities(filters.district);
  const infrastructure = useStorageInfrastructure();

  return (
    <div className="space-y-5">
      <PageHero
        title="Storage & Aggregation"
        subtitle="Official national infrastructure totals, verified cold-chain program context, and a clearly-labelled OR-Tools scenario."
      />

      <div className="card border-amber/25 bg-amber/[0.05] p-4">
        <h2 className="text-sm font-semibold text-amber">No verified facility capacity is assumed</h2>
        <p className="mt-1 text-xs text-slate-700">
          The public cold-chain announcement names program districts but publishes neither facility
          coordinates nor capacities. Cropmatics therefore shows <strong>Capacity not verified</strong>{" "}
          rather than inventing a number, and excludes such facilities from optimization.
        </p>
      </div>

      {/* 1. Official national context -------------------------------------- */}
      <section aria-labelledby="official-context" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="official-context" className="text-sm font-semibold text-forest-deep">
            Official context
          </h2>
          <DataBadge kind="official_national" />
          <DataBadge kind="verified_program" />
        </div>

        {infrastructure.error ? (
          <ErrorState
            message={(infrastructure.error as Error).message}
            onRetry={() => infrastructure.refetch()}
          />
        ) : (
          <NationalInfrastructureSummary
            data={infrastructure.data}
            isLoading={infrastructure.isLoading}
          />
        )}

        <ColdChainProgramPanel program={infrastructure.data?.program} />
      </section>

      {/* 2. District-level program coverage -------------------------------- */}
      <section aria-labelledby="program-coverage" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="program-coverage" className="text-sm font-semibold text-forest-deep">
            Program coverage by district
          </h2>
          <DataBadge kind="verified_program" />
          <DataBadge kind="not_verified" />
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
      </section>

      {/* 3. Scenario optimization ------------------------------------------ */}
      <section aria-labelledby="scenario" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="scenario" className="text-sm font-semibold text-forest-deep">
            Scenario optimization
          </h2>
          <DataBadge kind="scenario_input" />
        </div>
        <OptimizationDemo />
      </section>
    </div>
  );
}
