"use client";

import { ArrowRight, MapPinned, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
 * 3. **Where to look** - a short priority answer and an optional map launcher.
 *    The map opens on demand so spatial detail does not crowd the landing page.
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
  const [showMap, setShowMap] = useState(false);

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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/10 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPinned className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-forest-deep dark:text-white">Rwanda productivity map</p>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              Open the district map when you need spatial detail; the Overview stays focused on findings.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90"
        >
          <MapPinned className="h-4 w-4" aria-hidden="true" />
          Open map
        </button>
      </div>

      {districtMode ? (
        <>
          {/* District selections keep the insight and weather context visible;
              the spatial layer opens only from the map launcher above. */}
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

      <div className="max-w-5xl">
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

      {showMap ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-map-title"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") setShowMap(false);
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowMap(false);
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3 border-b border-forest/10 px-4 py-3 dark:border-white/10">
              <div>
                <h2 id="dashboard-map-title" className="text-base font-semibold text-forest-deep dark:text-white">
                  Rwanda productivity map
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  {filters.crop ? `${filters.crop} · ` : "All crops · "}
                  {filters.period ?? "published selection"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMap(false)}
                aria-label="Close map"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-forest-deep dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
              <ProductivityRiskMap
                filters={filters}
                selectedDistrict={filters.district}
                onSelectDistrict={(district) =>
                  setFilters({ district: filters.district === district ? undefined : district })
                }
                height={Math.min(600, typeof window === "undefined" ? 560 : Math.max(420, window.innerHeight - 230))}
              />
            </div>
          </div>
        </div>
      ) : null}

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
