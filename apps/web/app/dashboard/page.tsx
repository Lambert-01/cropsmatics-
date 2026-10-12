"use client";

import { ChevronDown, X } from "lucide-react";

import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { CompareCropsControl } from "@/components/filters/CompareCropsControl";
import { PageHero } from "@/components/layout/PageHero";
import { ProvenanceCard } from "@/components/ProvenanceCard";
import {
  CoverageNotice,
  ErrorState,
  KpiRowSkeleton,
  ScopeNotice,
} from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { InsightPanel } from "@/features/dashboard/InsightPanel";
import { PeriodScopeControl } from "@/features/dashboard/PeriodScopeControl";
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

/**
 * The Overview: one decision question per screenful.
 *
 * 1. **Scope** - the filter bar, the compact period scope control, and an
 *    explicit scope line, so a reader knows what every figure below covers
 *    before reading one. The published axis itself lives behind the control's
 *    coverage popover: it is reference material, not the answer.
 * 2. **Headline** - at most four KPIs, one scope and one period.
 * 3. **Where to look** - the map as the visual anchor, with the short priority
 *    answer beside it. Selecting a district re-scopes the page.
 * 4. **Evidence** - one crop trend and the ranked comparison.
 * 5. **Details** - gap views, adoption trends and the full matrix, one
 *    interaction away rather than competing with the answer for attention.
 *
 * The panels are not ordered by size or by authoring history; each screenful
 * answers its question and then gets out of the way.
 */
export default function DashboardPage() {
  const { filters, setFilters } = useFilters();

  const overview = useOverview(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const priorities = usePriorities(filters, 16, districtMode);
  // National trends are deliberately multi-period: this panel names its own
  // scope rather than following the selected release.
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

      {/* The published axis as a control, not as a list. Fourteen releases are
          fully reachable here (explicit all-periods scope, year, season, and a
          coverage popover) without spending the first screen on them. */}
      {overview.data ? (
        <PeriodScopeControl
          periods={overview.data.period_timeline ?? []}
          view={filters.view}
          period={filters.period}
          year={filters.year}
          season={filters.season}
          onChange={(patch) => setFilters(patch)}
        />
      ) : null}

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

      {/* Scope before figures. With no release selected the district numbers
          still describe one, and it has to be named before they are read. */}
      {overview.data ? (
        <ScopeNotice scope={overview.data.scope} snapshot={overview.data.snapshot} />
      ) : null}

      {overview.data ? (
        <CoverageNotice level={overview.data.coverage_level} period={overview.data.period} />
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

      {districtMode ? (
        <>
          {/* Screenful 1: the map is the anchor, and the short priority answer
              sits beside it. Everything district-level on this page resolves to
              the release named in the scope line above. */}
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
                kpis={
                  overview.data.primary_kpis.length
                    ? overview.data.primary_kpis
                    : overview.data.kpis
                }
                priorities={priorities.data?.rows ?? []}
                period={overview.data.period}
                coverageLevel={overview.data.coverage_level}
              />
            ) : null}
          </div>

          {/* Screenful 2: one trend and the ranked comparison. */}
          <div className="grid gap-5 xl:grid-cols-2">
            <PriorityTable
              rows={priorities.data?.rows ?? []}
              onSelectDistrict={(d) => setFilters({ district: d })}
              benchmarkStrategy={priorities.data?.provenance?.benchmark_strategy ?? null}
              period={priorities.data?.provenance?.source_period ?? null}
            />
            <YieldTrendChart
              data={trends.data}
              isLoading={trends.isLoading}
              isFetching={trends.isFetching}
              hasError={trends.isError}
              errorMessage={(trends.error as Error)?.message}
              onRetry={() => trends.refetch()}
              crop={filters.crop}
            />
          </div>

          {/* Details: useful to an analyst, and not the answer. Collapsed so the
              page leads with its decision question instead of ten charts. */}
          <details className="card group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-700 marker:content-none">
              <span>
                Detailed analysis
                <span className="ml-1.5 font-normal text-slate-400">
                  gap distribution, adoption trends, full district x crop matrix
                </span>
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>

            <div className="mt-4 space-y-5">
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

              <InputAdoptionChart
                data={inputAdoption.data}
                isLoading={inputAdoption.isLoading}
                isFetching={inputAdoption.isFetching}
                hasError={inputAdoption.isError}
                errorMessage={(inputAdoption.error as Error)?.message}
                onRetry={() => inputAdoption.refetch()}
              />

              <GapAdvancedMatrix filters={filters} districtMode={districtMode} />
            </div>
          </details>
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <YieldTrendChart
            data={trends.data}
            isLoading={trends.isLoading}
            isFetching={trends.isFetching}
            hasError={trends.isError}
            errorMessage={(trends.error as Error)?.message}
            onRetry={() => trends.refetch()}
            crop={filters.crop}
          />
          <InputAdoptionChart
            data={inputAdoption.data}
            isLoading={inputAdoption.isLoading}
            isFetching={inputAdoption.isFetching}
            hasError={inputAdoption.isError}
            errorMessage={(inputAdoption.error as Error)?.message}
            onRetry={() => inputAdoption.refetch()}
          />
        </div>
      )}

      {overview.data ? <ProvenanceCard provenance={overview.data.provenance} /> : null}
    </div>
  );
}
