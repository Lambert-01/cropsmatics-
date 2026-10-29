"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";

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
import { CanonicalTrendChart } from "@/features/dashboard/CanonicalTrendChart";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { FertilizerSourceCard } from "@/features/dashboard/FertilizerSourceCard";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { InsightPanel } from "@/features/dashboard/InsightPanel";
import { PeriodScopeControl } from "@/features/dashboard/PeriodScopeControl";
import { PriorityTable } from "@/features/dashboard/PriorityTable";
import { ProductivityRiskMap } from "@/features/dashboard/ProductivityRiskMap";
import { YieldTrendChart } from "@/features/dashboard/YieldTrendChart";
import { WeatherContextCard } from "@/features/dashboard/WeatherContextCard";
import { CropEntryPoint } from "@/features/crops/CropEntryPoint";
import { FieldEvidenceSummary } from "@/features/maps/FieldEvidenceSummary";
import { FieldEvidenceDistrictChart } from "@/features/dashboard/FieldEvidenceDistrictChart";
import {
  useCanonicalTrend,
  useFertilizerSource,
  useInputAdoption,
  useOverview,
  usePriorities,
  useTrends,
  useFieldObservations,
  useWeatherContext,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

/**
 * The Overview: one decision question per screenful.
 *
 * 1. **Scope** - the filter bar (non-period filters only), the compact period
 *    scope control, and an explicit scope line, so a reader knows what every
 *    figure below covers before reading one. The period axis is owned by exactly
 *    one control; a second period selector in the filter bar would be a control
 *    that can disagree with the first.
 * 2. **Headline** - at most four KPIs, one scope and one period.
 * 3. **Where to look** - the map as the visual anchor, with the short priority
 *    answer beside it. Selecting a district re-scopes the page.
 * 4. **Evidence** - the canonical multi-period trend and the ranked comparison.
 * 5. **Where to go deeper** - the gap distribution, adoption/practice detail,
 *    district x crop matrix and model diagnostics are *answers*, but to
 *    different questions. They live on their own pages, reached from one compact
 *    card, instead of being stacked inside a disclosure whose nested chart cards
 *    made this page read as a workspace rather than an overview.
 */
export default function DashboardPage() {
  // The national dashboard is a *landing* page: it opens on the historical,
  // all-crops, all-districts overview and never lets a stored default period
  // (e.g. a legacy `defaultPeriod = "2025B"`) override the landing scope. A
  // release named in the URL still wins, so a shared link reproduces faithfully.
  const { filters, setFilters } = useFilters({ landing: true });

  const overview = useOverview(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const priorities = usePriorities(filters, 16, districtMode);
  const compareCrops = (filters.compare ?? "")
    .split(",")
    .map((crop) => crop.trim())
    .filter(Boolean);
  const compareKey = compareCrops.length >= 2 && compareCrops.length <= 5
    ? compareCrops.join(",")
    : undefined;
  const comparisonTrend = useTrends(undefined, compareKey, Boolean(compareKey));
  // The trend reads the canonical multi-period panel (2022A-2026B): one period
  // axis, no release mixing, and a period the release did not tabulate is a gap
  // in the line. A valid compare selection switches to the national
  // area/production comparison endpoint; raw cross-crop yield is never shown.
  const canonicalTrend = useCanonicalTrend(filters.crop, filters.district, !compareKey);
  // The national adoption trend stays on the landing page: it is a national
  // context series (not district estimates) and does not need a district.
  const inputAdoption = useInputAdoption();
  const fertilizerSource = useFertilizerSource(filters);
  const weather = useWeatherContext(filters.district);
  const fieldObservations = useFieldObservations(filters);

  return (
    <div className="space-y-5">
      <PageHero
        title="National Crop Intelligence Overview"
        subtitle="Turning official data into action for a productive and resilient Rwanda."
      />

      {/* The period axis is owned by `PeriodScopeControl` below. The filter bar
          is restricted to the non-period filters so the page does not present
          two different period controls that can disagree. */}
      <AnalyticsFilterBar supported={["crop", "province", "district", "benchmark"]} />

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
            <div className="space-y-5">
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
              <WeatherContextCard
                data={weather.data}
                isLoading={weather.isLoading}
                error={weather.error as Error | null}
                onRetry={() => weather.refetch()}
              />
            </div>
          </div>

          {/* Screenful 2: the canonical trend and the ranked comparison. */}
          <div className="grid gap-5 xl:grid-cols-2">
            <PriorityTable
              rows={priorities.data?.rows ?? []}
              isFetching={priorities.isFetching}
              onSelectDistrict={(d) => setFilters({ district: d })}
              benchmarkStrategy={priorities.data?.provenance?.benchmark_strategy ?? null}
              period={priorities.data?.provenance?.source_period ?? null}
            />
            {compareKey ? (
              <YieldTrendChart
                data={comparisonTrend.data}
                isLoading={comparisonTrend.isLoading}
                isFetching={comparisonTrend.isFetching}
                hasError={comparisonTrend.isError}
                errorMessage={(comparisonTrend.error as Error)?.message}
                onRetry={() => comparisonTrend.refetch()}
              />
            ) : (
              <CanonicalTrendChart
                data={canonicalTrend.data}
                isLoading={canonicalTrend.isLoading}
                isFetching={canonicalTrend.isFetching}
                hasError={canonicalTrend.isError}
                errorMessage={(canonicalTrend.error as Error)?.message}
                onRetry={() => canonicalTrend.refetch()}
                crop={filters.crop}
                district={filters.district}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            {compareKey ? (
              <YieldTrendChart
                data={comparisonTrend.data}
                isLoading={comparisonTrend.isLoading}
                isFetching={comparisonTrend.isFetching}
                hasError={comparisonTrend.isError}
                errorMessage={(comparisonTrend.error as Error)?.message}
                onRetry={() => comparisonTrend.refetch()}
              />
            ) : (
              <CanonicalTrendChart
                data={canonicalTrend.data}
                isLoading={canonicalTrend.isLoading}
                isFetching={canonicalTrend.isFetching}
                hasError={canonicalTrend.isError}
                errorMessage={(canonicalTrend.error as Error)?.message}
                onRetry={() => canonicalTrend.refetch()}
                crop={filters.crop}
                district={filters.district}
              />
            )}
            <InputAdoptionChart
              data={inputAdoption.data}
              isLoading={inputAdoption.isLoading}
              isFetching={inputAdoption.isFetching}
              hasError={inputAdoption.isError}
              errorMessage={(inputAdoption.error as Error)?.message}
              onRetry={() => inputAdoption.refetch()}
            />
          </div>
        </>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <FieldEvidenceSummary
          data={fieldObservations.data}
          filters={filters}
          isLoading={fieldObservations.isLoading}
          isError={fieldObservations.isError}
          onRetry={() => void fieldObservations.refetch()}
        />
        <FieldEvidenceDistrictChart
          data={fieldObservations.data}
          filters={filters}
          isLoading={fieldObservations.isLoading}
          isFetching={fieldObservations.isFetching}
          isError={fieldObservations.isError}
          onRetry={() => void fieldObservations.refetch()}
          onSelectDistrict={(district) => setFilters({ district })}
        />
      </div>

      {/* Fertilizer source shares are national context, so keep this panel
          available even when a district is selected. The card itself carries
          the national-only badge; it must never look like a district estimate. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <FertilizerSourceCard
          data={fertilizerSource.data}
          isLoading={fertilizerSource.isLoading}
          isFetching={fertilizerSource.isFetching}
          hasError={fertilizerSource.isError}
          errorMessage={(fertilizerSource.error as Error)?.message}
          onRetry={() => fertilizerSource.refetch()}
        />
      </div>

      <ExploreFurther districtMode={districtMode} />

      {overview.data ? <ProvenanceCard provenance={overview.data.provenance} /> : null}
    </div>
  );
}

/**
 * One compact card that routes to the pages that own the deeper answers.
 *
 * The Overview used to bury five analytical views (gap distribution, dumbbell,
 * adoption, practice indicators, full matrix) inside an expandable card, each a
 * chart card nested in another card. That answered detail questions on the
 * landing page and made the overview read as a workspace. The answers still
 * exist - on the pages built to hold them - and this is the one place that says
 * where.
 */
function ExploreFurther({ districtMode }: { districtMode: boolean }) {
  const links = [
    {
      href: "/productivity",
      title: "Productivity Intelligence",
      body: "Gap distribution, district ranking, the full district x crop matrix and practice indicators.",
    },
    {
      href: "/yield-intelligence",
      title: "Yield Intelligence",
      body: "Per-crop trends, spatial views, gap persistence and the forecasting publication gate.",
    },
    {
      href: "/interventions",
      title: "Intervention Planner",
      body: "Weighted priority ranking you can adjust, with the components and their availability shown.",
    },
  ] as const;

  return (
    <section aria-label="Explore further" className="card px-4 py-4">
      <h2 className="text-sm font-semibold text-forest-deep">
        {districtMode ? "Where to look next" : "Explore the analysis"}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        The Overview answers one question. The detailed analyses live on their own pages so neither
        is read out of context.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex flex-col rounded-lg border border-forest/10 bg-forest/[0.02] p-3 transition hover:border-forest/25 hover:bg-forest/[0.05]"
          >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-forest-deep">
              {link.title}
              <ArrowRight
                className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
            <span className="mt-1 text-xs leading-relaxed text-slate-600">{link.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
