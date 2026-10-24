"use client";

import { useMemo, useState } from "react";

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
  const { filters, setFilters } = useFilters();
  const [metric, setMetric] = useState<MapMetricId>("input_adoption");
  const mapMetrics = useMapMetrics(filters, metric);
  // Two requests on purpose: one for the option list (every program district) and
  // one for the scoped result. Filtering the list in React would put an
  // analytical selection back in the client, and one request would make the
  // option list shrink as soon as a district was chosen.
  const allFacilities = useFacilities();
  const facilities = useFacilities(filters.district);
  const infrastructure = useStorageInfrastructure();

  const programDistricts = useMemo(
    () =>
      Array.from(new Set((allFacilities.data?.facilities ?? []).map((f) => f.district))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [allFacilities.data],
  );

  return (
    <div className="space-y-5">
      <PageHero
        title="Storage & Aggregation"
        subtitle="Official national infrastructure totals, verified cold-chain program context, and a clearly-labelled OR-Tools scenario."
      />

      <div className="card border-amber/25 bg-amber/[0.05] p-4">
        <h2 className="text-sm font-semibold text-amber-800">No verified facility capacity is assumed</h2>
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

        {/* The page reads a district from the shared filter state, so it has to
            offer a way to change it. Without this, arriving from another page
            left the list scoped with no visible control. The national totals in
            the section above are deliberately unaffected by this selection. */}
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Program district
          </span>
          <select
            aria-label="Program district"
            value={filters.district ?? ""}
            onChange={(event) => setFilters({ district: event.target.value || undefined })}
            className="input w-auto"
          >
            <option value="">All program districts</option>
            {programDistricts.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500">
            {filters.district
              ? `Showing program context for ${filters.district}. National infrastructure totals above are unaffected.`
              : "Scopes this section only; national infrastructure totals are never district-scoped."}
          </span>
        </label>

        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          {mapMetrics.isError && !mapMetrics.data ? (
            <ErrorState
              message="The storage map metric could not be loaded for this selection."
              onRetry={() => void mapMetrics.refetch()}
            />
          ) : mapMetrics.isLoading && !mapMetrics.data ? (
            <MapSkeleton />
          ) : (
            <div className="space-y-2">
              {mapMetrics.isError ? (
                <ErrorState
                  message="The latest storage map refresh failed; showing the last loaded metric."
                  onRetry={() => void mapMetrics.refetch()}
                />
              ) : null}
              <RwandaDistrictMap
                data={mapMetrics.data}
                metric={metric}
                onMetricChange={setMetric}
                facilities={facilities.data?.facilities ?? []}
              />
            </div>
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
