"use client";

import { useState } from "react";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { CompareCropsControl } from "@/components/filters/CompareCropsControl";
import { PageHero } from "@/components/layout/PageHero";
import { CoverageNotice, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { PracticeIndicatorsPanel } from "@/features/dashboard/PracticeIndicatorsPanel";
import { ProductivityRiskMap } from "@/features/dashboard/ProductivityRiskMap";
import { YieldTrendChart } from "@/features/dashboard/YieldTrendChart";
import { CropEntryPoint } from "@/features/crops/CropEntryPoint";
import { DistrictChangePanel } from "@/features/productivity/DistrictChangePanel";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { FactorAssociationChart } from "@/features/productivity/FactorAssociationChart";
import { GapAdvancedMatrix } from "@/features/productivity/GapAdvancedMatrix";
import { GapDumbbell } from "@/features/productivity/GapDumbbell";
import { GapRankedBars } from "@/features/productivity/GapRankedBars";
import { ModelPerformancePanel } from "@/features/productivity/ModelPerformancePanel";
import {
  useFactors,
  useInputAdoption,
  useOverview,
  usePracticeIndicators,
  useProductivity,
  useTrends,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

/**
 * Productivity: one question, answered once.
 *
 * > How does this crop's harvest per hectare differ across districts in the
 * > selected season?
 *
 * The benchmark strategy lives in the filter bar and nowhere else. It used to be
 * rendered twice - once in the bar, once as a button group below it - which meant
 * two controls could show different states and a reader had to work out which one
 * was in effect. One control, URL-backed and shareable, is the whole fix.
 *
 * Layout: the map and the ranking are one workspace (pick a district on the map,
 * see the same row marked in the table), and the model diagnostics and factor
 * associations - neither of which answers the district question - sit under
 * "Evidence & methods" rather than ahead of it.
 */
type ProductivityView = "comparison" | "practice" | "change" | "evidence";

const PRODUCTIVITY_VIEWS = [
  { id: "comparison", label: "Comparison" },
  { id: "practice", label: "Practice" },
  { id: "change", label: "Change over time" },
  { id: "evidence", label: "Evidence" },
] as const;

export default function ProductivityPage() {
  const { filters, setFilters } = useFilters();
  const [view, setView] = useState<ProductivityView>("comparison");
  const overview = useOverview(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const productivity = useProductivity(filters, districtMode);
  const factors = useFactors(
    filters,
    districtMode && Boolean(filters.crop) && view === "evidence",
  );
  const trends = useTrends(filters.crop, filters.compare, !districtMode);
  const inputs = useInputAdoption();
  // District-scoped practice indicators. The full panel is 9,468 rows, so the
  // request waits for a district and pages one district's ~306 rows; an
  // unfiltered read is one arbitrary page, never a national picture.
  const practiceIndicators = usePracticeIndicators({
    district: filters.district ?? undefined,
    limit: 500,
    enabled: Boolean(filters.district) && view === "practice",
  });
  const benchmarkStrategy =
    productivity.data?.provenance?.benchmark_strategy ?? filters.benchmark ?? null;

  // A raw yield only means something for a named crop: averaging across crops
  // with different natural scales is not a productivity figure. With no crop
  // selected the page shows the picker and the coverage, not a wall of charts
  // that need a crop to be read correctly.
  const cropSelected = Boolean(filters.crop);

  return (
    <div className="space-y-5">
      <PageHero
        title="Productivity Intelligence"
        subtitle="Diagnose crop productivity gaps and the factors associated with them across Rwanda."
      />

      <AnalyticsFilterBar
        supported={["year", "season", "crop", "province", "district", "benchmark"]}
      />

      <div className="flex flex-wrap items-center gap-2 px-1">
        {overview.data && !districtMode ? <CompareCropsControl /> : null}
        <CropEntryPoint crop={filters.crop} />
      </div>

      {overview.error ? (
        <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} />
      ) : null}
      {overview.isLoading ? <KpiRowSkeleton count={4} /> : null}

      {overview.data && !districtMode ? (
        <>
          <CoverageNotice level={overview.data.coverage_level} period={overview.data.period} />
          <DashboardKpis
            kpis={overview.data.kpis}
            primaryKpis={overview.data.primary_kpis}
            secondaryKpis={overview.data.secondary_kpis}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <YieldTrendChart data={trends.data} isLoading={trends.isLoading} crop={filters.crop} />
            <InputAdoptionChart data={inputs.data} isLoading={inputs.isLoading} />
          </div>
          <ProvenanceCard provenance={overview.data.provenance} />
        </>
      ) : null}

      {districtMode && !cropSelected ? (
        <div className="card p-5">
          <h2 className="card-title">Select a crop to diagnose its productivity</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Harvest per hectare is only comparable within one crop: crops have different natural
            yield scales, so a cross-crop average is not a productivity figure. Pick a crop and this
            page reports its gaps, its district ranking and the practices associated with it.
          </p>
        </div>
      ) : null}

      {districtMode && productivity.error ? (
        <ErrorState
          message={(productivity.error as Error).message}
          onRetry={() => productivity.refetch()}
        />
      ) : null}

      {districtMode && productivity.isLoading ? (
        <KpiRowSkeleton count={4} />
      ) : districtMode && productivity.data && cropSelected ? (
        <DashboardKpis
          kpis={productivity.data.kpis}
          primaryKpis={productivity.data.primary_kpis}
          secondaryKpis={productivity.data.secondary_kpis}
        />
      ) : null}

      {districtMode && cropSelected ? (
        <>
          <Tabs
            items={PRODUCTIVITY_VIEWS.map((item) => ({ ...item }))}
            active={view}
            onChange={(next) => setView(next as ProductivityView)}
            ariaLabel="Productivity analysis views"
          />

          {/* The workspace: the map and the ranking answer the same question, so
              they sit side by side and share one selection. */}
          <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
            <ProductivityRiskMap
              filters={filters}
              selectedDistrict={filters.district}
              onSelectDistrict={(district) =>
                setFilters({ district: filters.district === district ? undefined : district })
              }
            />
            <DistrictRankingTable
              rows={productivity.data?.rows ?? []}
              onSelectDistrict={(d) =>
                setFilters({ district: filters.district === d ? undefined : d })
              }
              selectedDistrict={filters.district}
            />
          </div>

          {view === "comparison" ? (
            /* Two answers to "who is furthest below, and by how much" share one
               scope and one visual section. */
            <div className="grid gap-5 xl:grid-cols-2">
              <GapRankedBars
                rows={productivity.data?.rows ?? []}
                isLoading={productivity.isLoading}
                period={productivity.data?.period}
                benchmark={benchmarkStrategy}
              />
              <GapDumbbell
                rows={productivity.data?.rows ?? []}
                isLoading={productivity.isLoading}
                period={productivity.data?.period}
                benchmark={benchmarkStrategy}
              />
            </div>
          ) : null}

          {view === "practice" ? (
            <PracticeIndicatorsPanel
              data={practiceIndicators.data}
              district={filters.district}
              isLoading={practiceIndicators.isLoading}
              isFetching={practiceIndicators.isFetching}
              hasError={practiceIndicators.isError}
              errorMessage={(practiceIndicators.error as Error)?.message}
              onRetry={() => practiceIndicators.refetch()}
            />
          ) : null}

          {view === "change" ? <DistrictChangePanel filters={filters} /> : null}

          {view === "evidence" ? (
            <div className="space-y-5">
              <FactorAssociationChart
                data={factors.data}
                isLoading={factors.isLoading}
                crop={filters.crop}
              />
              <ModelPerformancePanel />
              <GapAdvancedMatrix filters={filters} districtMode={districtMode} />
              {productivity.data ? (
                <ProvenanceCard provenance={productivity.data.provenance} />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
