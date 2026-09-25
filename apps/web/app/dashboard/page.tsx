"use client";

import { X } from "lucide-react";

import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { CompareCropsControl } from "@/components/filters/CompareCropsControl";
import { PageHero } from "@/components/layout/PageHero";
import { ProvenanceCard } from "@/components/ProvenanceCard";
import { CoverageNotice, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { GapHeatmap } from "@/features/dashboard/GapHeatmap";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { InsightPanel } from "@/features/dashboard/InsightPanel";
import { PriorityTable } from "@/features/dashboard/PriorityTable";
import { ProductivityRiskMap } from "@/features/dashboard/ProductivityRiskMap";
import { YieldTrendChart } from "@/features/dashboard/YieldTrendChart";
import {
  useHeatmap,
  useInputAdoption,
  useOverview,
  usePriorities,
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
  const heatmap = useHeatmap(filters, "gap", districtMode);

  return (
    <div className="space-y-5">
      <PageHero
        title="National Crop Intelligence Overview"
        subtitle="Turning official data into action for a productive and resilient Rwanda."
      />

      <AnalyticsFilterBar />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <CompareCropsControl />
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
        <KpiRowSkeleton count={8} />
      ) : overview.data ? (
        <DashboardKpis kpis={overview.data.kpis} />
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
            kpis={overview.data.kpis}
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
        />
        <YieldTrendChart data={trends.data} isLoading={trends.isLoading} crop={filters.crop} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <InputAdoptionChart data={inputAdoption.data} isLoading={inputAdoption.isLoading} />
        <GapHeatmap data={heatmap.data} isLoading={heatmap.isLoading} />
      </div>
      </> : null}

      {overview.data ? <ProvenanceCard provenance={overview.data.provenance} /> : null}
    </div>
  );
}
