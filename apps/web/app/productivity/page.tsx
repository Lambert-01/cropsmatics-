"use client";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { PageHeading } from "@/components/ui/PageHeading";
import { CoverageNotice, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { ProductivityRiskMap } from "@/features/dashboard/ProductivityRiskMap";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { FactorAssociationChart } from "@/features/productivity/FactorAssociationChart";
import { ModelPerformancePanel } from "@/features/productivity/ModelPerformancePanel";
import { cn } from "@/lib/cn";
import { BENCHMARK_OPTIONS, DEFAULT_BENCHMARK } from "@/lib/filters";
import { useFactors, useProductivity } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

export default function ProductivityPage() {
  const { filters, setFilters } = useFilters();

  const productivity = useProductivity(filters);
  const factors = useFactors(filters);

  return (
    <div className="space-y-5">
      <PageHeading
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

      {productivity.error ? (
        <ErrorState
          message={(productivity.error as Error).message}
          onRetry={() => productivity.refetch()}
        />
      ) : null}

      {productivity.isLoading ? (
        <KpiRowSkeleton count={5} />
      ) : productivity.data ? (
        <DashboardKpis kpis={productivity.data.kpis} />
      ) : null}

      {productivity.data ? (
        <CoverageNotice level={filters.year || filters.season ? undefined : "district"} period={null} />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <ProductivityRiskMap
          filters={filters}
          selectedDistrict={filters.district}
          onSelectDistrict={(d) => setFilters({ district: d })}
        />
        <FactorAssociationChart data={factors.data} isLoading={factors.isLoading} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <DistrictRankingTable
          rows={productivity.data?.rows ?? []}
          onSelectDistrict={(d) => setFilters({ district: d })}
        />
        <ModelPerformancePanel />
      </div>

      {productivity.data ? <ProvenanceCard provenance={productivity.data.provenance} /> : null}
    </div>
  );
}
