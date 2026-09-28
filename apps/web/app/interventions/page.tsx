"use client";

import { useState } from "react";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { PageHero } from "@/components/layout/PageHero";
import { CoverageNotice, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { YieldTrendChart } from "@/features/dashboard/YieldTrendChart";
import { DistrictExplorer } from "@/features/interventions/DistrictExplorer";
import { PrioritiesWorkspace } from "@/features/interventions/PrioritiesWorkspace";
import { PriorityScenarioLab } from "@/features/interventions/PriorityScenarioLab";
import { SensitivityLab } from "@/features/interventions/SensitivityLab";
import type { DashboardFilters } from "@/lib/filters";
import { useInputAdoption, useOverview, useTrends } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";
import type { OverviewResponse } from "@/types";

/**
 * Analytical workspaces.
 *
 * ``priorities`` ranks the published candidates under the planner's weights;
 * ``explorer`` reads the same candidates district-first; ``scenario`` compares two
 * reviewable weightings; ``sensitivity`` tests how robust that ranking is to the
 * weighting choice. Each is a re-computation of published observations — none of
 * them predicts an outcome, and the page never offers a tab it cannot deliver.
 */
const INTERVENTION_TABS = [
  { id: "priorities", label: "Priorities" },
  { id: "explorer", label: "District explorer" },
  { id: "scenario", label: "Scenario lab" },
  { id: "sensitivity", label: "Sensitivity" },
];

export default function InterventionsPage() {
  const { filters } = useFilters();
  const overview = useOverview(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const [tab, setTab] = useState<string>("priorities");

  return (
    <div className="space-y-5">
      <PageHero
        title="Intervention Intelligence"
        subtitle="Rank districts and crops, see why they rank where they do, compare reviewable weightings, and test how much the ranking depends on them."
      />

      <AnalyticsFilterBar
        supported={["year", "season", "crop", "province", "district", "benchmark"]}
      />

      {overview.error ? (
        <ErrorState
          message={(overview.error as Error).message}
          onRetry={() => overview.refetch()}
        />
      ) : null}
      {overview.isLoading ? <KpiRowSkeleton count={4} /> : null}

      {/*
        Without district-level coverage the planner has nothing to rank. Rather
        than showing an empty ranking, the page states the coverage level and
        falls back to the national overview it can actually support.
      */}
      {overview.data && !districtMode ? (
        <NationalOverview overview={overview.data} filters={filters} />
      ) : null}

      {districtMode ? (
        <>
          <Tabs
            items={INTERVENTION_TABS}
            active={tab}
            onChange={setTab}
            ariaLabel="Intervention Intelligence workspaces"
          />

          {tab === "priorities" ? <PrioritiesWorkspace filters={filters} /> : null}
          {tab === "explorer" ? <DistrictExplorer filters={filters} /> : null}
          {tab === "scenario" ? <PriorityScenarioLab filters={filters} /> : null}
          {tab === "sensitivity" ? <SensitivityLab filters={filters} /> : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * National fallback.
 *
 * Mounted only when district rows are unavailable, so its trend requests are
 * never fired for a selection the planner cannot use anyway.
 */
function NationalOverview({
  overview,
  filters,
}: {
  overview: OverviewResponse;
  filters: DashboardFilters;
}) {
  const trends = useTrends(filters.crop);
  const inputs = useInputAdoption();

  return (
    <>
      <CoverageNotice level={overview.coverage_level} period={overview.period} />
      <DashboardKpis
        kpis={overview.kpis}
        primaryKpis={overview.primary_kpis}
        secondaryKpis={overview.secondary_kpis}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <YieldTrendChart data={trends.data} isLoading={trends.isLoading} crop={filters.crop} />
        <InputAdoptionChart data={inputs.data} isLoading={inputs.isLoading} />
      </div>
      <ProvenanceCard provenance={overview.provenance} />
    </>
  );
}
