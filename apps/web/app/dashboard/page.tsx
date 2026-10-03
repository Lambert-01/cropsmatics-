"use client";

import { X } from "lucide-react";

import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { CompareCropsControl } from "@/components/filters/CompareCropsControl";
import { PageHero } from "@/components/layout/PageHero";
import { ProvenanceCard } from "@/components/ProvenanceCard";
import { CoverageNotice, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { InsightPanel } from "@/features/dashboard/InsightPanel";
import { PriorityTable } from "@/features/dashboard/PriorityTable";
import { ProductivityRiskMap } from "@/features/dashboard/ProductivityRiskMap";
import { YieldTrendChart } from "@/features/dashboard/YieldTrendChart";
import { CropEntryPoint } from "@/features/crops/CropEntryPoint";
import { GapAdvancedMatrix } from "@/features/productivity/GapAdvancedMatrix";
import { GapDumbbell } from "@/features/productivity/GapDumbbell";
import { GapRankedBars } from "@/features/productivity/GapRankedBars";
import {
  useInputAdoption,
  useOverview,
  usePriorities,
  useProductivity,
  useTrends,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

export default function DashboardPage() {
  const { filters, setFilters } = useFilters();

  const overview = useOverview(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const priorities = usePriorities(filters, 16, districtMode);
  const trends = useTrends(filters.crop, filters.compare);
  const inputAdoption = useInputAdoption();
  // The gap views read the productivity panel's own published columns (observed
  // yield, benchmark, gap index) rather than deriving a shortfall locally, so
  // the dashboard and the Productivity page can never disagree about a number.
  const productivity = useProductivity(filters, districtMode);
  const benchmarkStrategy =
    productivity.data?.provenance?.benchmark_strategy ?? filters.benchmark ?? null;

  return (
    <div className="space-y-5">
      <PageHero
        title="National Crop Intelligence Overview"
        subtitle="Turning official data into action for a productive and resilient Rwanda."
      />

      <AnalyticsFilterBar />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <CompareCropsControl />
        <CropEntryPoint crop={filters.crop} />
      </div>

      {filters.district ? (
        <div className="flex items-center gap-2">
          <span className="chip">
            District: <strong className="text-forest">{filters.district}</strong>
            <button
              type="button"
              onClick={() => setFilters({ district: undefined })}
              aria-label="Clear district filter"
              className="ml-1 rounded-full p-0.5 hover:bg-forest/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      ) : null}

      {overview.error ? (
        <ErrorState
          message={(overview.error as Error).message}
          onRetry={() => overview.refetch()}
        />
      ) : null}

      {overview.isLoading ? (
        <KpiRowSkeleton count={4} />
      ) : overview.data ? (
        <DashboardKpis
          kpis={overview.data.kpis}
          primaryKpis={overview.data.primary_kpis}
          secondaryKpis={overview.data.secondary_kpis}
        />
      ) : null}

      {overview.data ? (
        <CoverageNotice level={overview.data.coverage_level} period={overview.data.period} />
      ) : null}

      {!districtMode && overview.data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <YieldTrendChart data={trends.data} isLoading={trends.isLoading} crop={filters.crop} />
          <InputAdoptionChart data={inputAdoption.data} isLoading={inputAdoption.isLoading} />
        </div>
      ) : null}

      {districtMode ? <>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <ProductivityRiskMap
          filters={filters}
          selectedDistrict={filters.district}
          onSelectDistrict={(district) =>
            setFilters({ district: filters.district === district ? undefined : district })
          }
        />
        {overview.data ? (
          <InsightPanel
            kpis={overview.data.primary_kpis.length ? overview.data.primary_kpis : overview.data.kpis}
            priorities={priorities.data?.rows ?? []}
            period={overview.data.period}
            coverageLevel={overview.data.coverage_level}
          />
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <PriorityTable
          rows={priorities.data?.rows ?? []}
          onSelectDistrict={(d) => setFilters({ district: d })}
          benchmarkStrategy={priorities.data?.provenance?.benchmark_strategy ?? null}
          period={priorities.data?.provenance?.source_period ?? null}
        />
        <YieldTrendChart data={trends.data} isLoading={trends.isLoading} crop={filters.crop} />
      </div>

      {/* Gap diagnosis leads with the two questions a reader actually asks -
          "who is furthest below benchmark" and "by how much" - and then offers
          the full district x crop grid collapsed at the end. The matrix used to
          dominate this row while the ranked answer did not exist at all. */}
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

      <InputAdoptionChart data={inputAdoption.data} isLoading={inputAdoption.isLoading} />

      <GapAdvancedMatrix filters={filters} districtMode={districtMode} />
      </> : null}

      {overview.data ? <ProvenanceCard provenance={overview.data.provenance} /> : null}
    </div>
  );
}
