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
import { FieldEvidenceSummary } from "@/features/maps/FieldEvidenceSummary";
import { PrioritiesWorkspace } from "@/features/interventions/PrioritiesWorkspace";
import { PriorityScenarioLab } from "@/features/interventions/PriorityScenarioLab";
import { PredictionsWorkspace } from "@/features/interventions/PredictionsWorkspace";
import { SensitivityLab } from "@/features/interventions/SensitivityLab";
import type { DashboardFilters } from "@/lib/filters";
import { useFieldObservations, useInputAdoption, useOverview, useTrends } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";
import type { OverviewResponse } from "@/types";

/**
 * Analytical workspaces.
 *
 * ``priorities`` ranks the published candidates under the planner's weights;
 * ``explorer`` reads the same candidates district-first; ``scenario`` compares two
 * reviewable weightings; ``sensitivity`` tests how robust that ranking is to the
 * weighting choice. Each is a re-computation of published observations.
 *
 * ``predictions`` is different in kind: it is the one place a *forecast* could
 * appear, and it shows the publication gate's own verdict. A scenario is never
 * relabelled a forecast — the tab exists precisely so the distinction is visible
 * on the page a planner is already using.
 */
const INTERVENTION_TABS = [
  { id: "priorities", label: "Priorities" },
  { id: "explorer", label: "District explorer" },
  { id: "scenario", label: "Scenario lab" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "predictions", label: "Predictions" },
];

export default function InterventionsPage() {
  const { filters } = useFilters();
  const overview = useOverview(filters);
  const fieldObservations = useFieldObservations(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const [tab, setTab] = useState<string>("priorities");

  return (
    <div className="space-y-5">
      <PageHero
        title="Intervention Intelligence"
        subtitle="Choose where to investigate, compare plans and review the evidence."
      />

      <AnalyticsFilterBar
        supported={["year", "season", "crop", "province", "district", "benchmark"]}
      />

      <FieldEvidenceSummary
        data={fieldObservations.data}
        filters={filters}
        isLoading={fieldObservations.isLoading}
        isError={fieldObservations.isError}
        onRetry={() => void fieldObservations.refetch()}
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

      {(
        <>
          <Tabs
            items={districtMode ? INTERVENTION_TABS : INTERVENTION_TABS.filter((item) => item.id === "predictions")}
            active={districtMode ? tab : "predictions"}
            onChange={setTab}
            ariaLabel="Intervention Intelligence workspaces"
          />

          {districtMode && tab === "priorities" ? <PrioritiesWorkspace filters={filters} /> : null}
          {districtMode && tab === "explorer" ? <DistrictExplorer filters={filters} /> : null}
          {districtMode && tab === "scenario" ? <PriorityScenarioLab filters={filters} /> : null}
          {districtMode && tab === "sensitivity" ? <SensitivityLab filters={filters} /> : null}
          {!districtMode || tab === "predictions" ? <PredictionsWorkspace filters={filters} /> : null}
        </>
      )}
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
