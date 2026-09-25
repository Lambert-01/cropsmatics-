"use client";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { PageHero } from "@/components/layout/PageHero";
import { CoverageNotice, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { ProductivityRiskMap } from "@/features/dashboard/ProductivityRiskMap";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { FactorAssociationChart } from "@/features/productivity/FactorAssociationChart";
import { ModelPerformancePanel } from "@/features/productivity/ModelPerformancePanel";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { YieldTrendChart } from "@/features/dashboard/YieldTrendChart";
import { cn } from "@/lib/cn";
import { BENCHMARK_OPTIONS, DEFAULT_BENCHMARK } from "@/lib/filters";
import { useFactors, useInputAdoption, useOverview, useProductivity, useTrends } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

export default function ProductivityPage() {
  const { filters, setFilters } = useFilters();
  const overview = useOverview(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const productivity = useProductivity(filters, districtMode);
  const factors = useFactors(filters, districtMode && Boolean(filters.crop));
  const trends = useTrends(filters.crop);
  const inputs = useInputAdoption();

  return (
    <div className="space-y-5">
      <PageHero
        title="Productivity Intelligence"
        subtitle="Diagnose crop productivity gaps and the factors associated with them across Rwanda."
      />

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Benchmark strategy
        </span>
        <div role="group" aria-label="Benchmark strategy" className="flex flex-wrap gap-1">
          {BENCHMARK_OPTIONS.map((option) => {
            const active = (filters.benchmark ?? DEFAULT_BENCHMARK) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilters({ benchmark: option.value })}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-primary text-white"
                    : "border border-forest/15 bg-white text-slate-600 hover:bg-forest/5",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {overview.error ? <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} /> : null}
      {overview.isLoading ? <KpiRowSkeleton count={5} /> : null}
      {overview.data && !districtMode ? (
        <>
          <CoverageNotice level={overview.data.coverage_level} period={overview.data.period} />
          <DashboardKpis kpis={overview.data.kpis} />
          <div className="grid gap-4 xl:grid-cols-2">
            <YieldTrendChart data={trends.data} isLoading={trends.isLoading} crop={filters.crop} />
            <InputAdoptionChart data={inputs.data} isLoading={inputs.isLoading} />
          </div>
          <ProvenanceCard provenance={overview.data.provenance} />
        </>
      ) : null}

      {districtMode && productivity.error ? (
        <ErrorState
          message={(productivity.error as Error).message}
          onRetry={() => productivity.refetch()}
        />
      ) : null}

      {districtMode && productivity.isLoading ? (
        <KpiRowSkeleton count={5} />
      ) : districtMode && productivity.data ? (
        <DashboardKpis kpis={productivity.data.kpis} />
      ) : null}

      {districtMode ? <>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <ProductivityRiskMap
          filters={filters}
          selectedDistrict={filters.district}
          onSelectDistrict={(d) => setFilters({ district: d })}
        />
        <FactorAssociationChart data={factors.data} isLoading={factors.isLoading} crop={filters.crop} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <DistrictRankingTable
          rows={productivity.data?.rows ?? []}
          onSelectDistrict={(d) => setFilters({ district: d })}
        />
        <ModelPerformancePanel />
      </div>

      {productivity.data ? <ProvenanceCard provenance={productivity.data.provenance} /> : null}
      </> : null}
    </div>
  );
}
