"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { PageHero } from "@/components/layout/PageHero";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { SourceDisclosure } from "@/components/ui/SourceDisclosure";
import { EmptyState, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { TrendCompareControl } from "@/features/crops/TrendCompareControl";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { FactorAssociationChart } from "@/features/productivity/FactorAssociationChart";
import { AIExplainPanel } from "@/features/yield-intelligence/AIExplainPanel";
import { DistrictYieldDrawer } from "@/features/yield-intelligence/DistrictYieldDrawer";
import { FieldEvidenceSummary } from "@/features/maps/FieldEvidenceSummary";
import { ForecastPanel } from "@/features/yield-intelligence/ForecastPanel";
import { ManualProjectionWorkspace } from "@/features/yield-intelligence/ManualProjectionWorkspace";
import { SimulationLab } from "@/features/yield-intelligence/SimulationLab";
import { YieldGapDistribution } from "@/features/yield-intelligence/YieldGapDistribution";
import {
  YieldOverTimeChart,
  type YieldTrendMode,
} from "@/features/yield-intelligence/YieldOverTimeChart";
import { YieldOverview } from "@/features/yield-intelligence/YieldOverview";
import type { MapMetricId } from "@/lib/constants";
import { periodLabel } from "@/lib/format";
import { YIELD_WORKSPACES, resolveWorkspace } from "@/lib/yield-workspaces";
import { splitPeriod } from "@/lib/filters";
import {
  useFactors,
  useFieldObservations,
  useMapMetrics,
  useProductivity,
  useProductivityTrend,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

/**
 * Yield Intelligence, organised as four decisions.
 *
 * Summary answers where the crop stands; Trends answers how it moved; Map answers
 * which districts; Planning answers what would follow from the reader's own
 * assumptions. The selection lives in the URL, so a link opens the workspace it was
 * copied from, and moving between workspaces pushes a history entry so the browser's
 * back button returns to the previous one.
 *
 * Headline set is declared here rather than inherited from response order: at most
 * four cards, all crop-specific and all for the selected period.
 */
const YIELD_KPI_IDS = ["mean_yield", "benchmark_yield", "gap_shortfall", "yoy_yield"];

export default function YieldIntelligencePage() {
  const { filters, setFilters } = useFilters();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const workspace = resolveWorkspace(searchParams.get("workspace"));
  const [trendMode, setTrendMode] = useState<YieldTrendMode>("same_season");
  // "" = no overlay; "national" = national series; otherwise a district name.
  const [compareTarget, setCompareTarget] = useState("");
  const [mapMetric, setMapMetric] = useState<MapMetricId>("yield");
  const [drawerDistrict, setDrawerDistrict] = useState<string | null>(null);

  const crop = filters.crop;
  const periodCode = filters.period;
  const { season } = splitPeriod(periodCode);

  // Hooks run unconditionally; the `enabled` flags keep an unselected crop from
  // firing four requests that can only come back empty.
  const productivity = useProductivity(filters, Boolean(crop));
  const trend = useProductivityTrend(crop, filters.district, undefined, Boolean(crop));

  // The overlay reads the same canonical panel as the primary series, so the two
  // yield lines are strictly comparable. National is only offered when the
  // primary series is a district; a district is never compared with itself.
  const compareNational = compareTarget === "national";
  const compareDistrictName = compareTarget && !compareNational ? compareTarget : undefined;
  const nationalTrend = useProductivityTrend(
    crop,
    undefined,
    undefined,
    Boolean(crop) && compareNational && Boolean(filters.district),
  );
  const districtTrend = useProductivityTrend(
    crop,
    compareDistrictName,
    undefined,
    Boolean(crop) && Boolean(compareDistrictName),
  );
  const comparisonData = compareNational ? nationalTrend.data : districtTrend.data;
  const comparisonLabel = compareNational ? "National" : (compareDistrictName ?? null);

  useEffect(() => {
    if (compareDistrictName && compareDistrictName === filters.district) setCompareTarget("");
  }, [compareDistrictName, filters.district]);

  const mapMetrics = useMapMetrics(filters, mapMetric, Boolean(crop));
  const factors = useFactors(filters, Boolean(crop));
  const fieldObservations = useFieldObservations(filters);

  const periodText = useMemo(
    () => (periodCode ? periodLabel(periodCode) : (productivity.data?.period ?? null)),
    [periodCode, productivity.data?.period],
  );

  const rows = productivity.data?.rows ?? [];
  // At most 30 districts; a plain lookup is cheaper than memoising the frame.
  const selectedRow = rows.find((row) => String(row.district) === drawerDistrict);
  // Same-season change and the period list belong to the active selection, so
  // they are shown only once the clicked district is the one being queried.
  const drawerHasSelection = drawerDistrict !== null && drawerDistrict === filters.district;

  // The filter selection, without the workspace itself, so a link into another
  // page opens it on exactly the selection the reader is looking at.
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("workspace");
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [searchParams]);

  function setWorkspace(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("workspace", id);
    // `push`, not `replace`: the brief's journey requires back/forward to move
    // between workspaces, and a replaced entry made the previous workspace
    // unreachable with the browser's own controls.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  /**
   * Opening a district scopes the page to it *and* opens its detail.
   *
   * Both, rather than only the drawer: the drill-down the reader asked for is the
   * district, so the trend and same-season figures behind it should follow.
   */
  function openDistrict(district: string) {
    setDrawerDistrict(district);
    setFilters({ district });
  }

  const aiPrompts = [
    filters.district
      ? `Explain ${filters.district} ${crop} yield`
      : `Explain the ${crop} yield pattern`,
    "Which districts are furthest below the benchmark?",
    "What data are missing for this selection?",
  ];

  return (
    <div className="space-y-5">
      <PageHero
        title="Yield Intelligence"
        subtitle="Understand how crop yields vary across seasons and districts, where yield gaps exist, and which observed factors warrant investigation."
      />

      <AnalyticsFilterBar />

      <FieldEvidenceSummary
        data={fieldObservations.data}
        filters={filters}
        isLoading={fieldObservations.isLoading}
        isError={fieldObservations.isError}
        onRetry={() => void fieldObservations.refetch()}
      />

      {!crop ? (
        <Card>
          <EmptyState
            title="Select a crop to open Yield Intelligence."
            hint="Yield is only comparable within a crop — maize, beans and potato kg/ha sit on different natural scales. Pick a crop above and this page fills with its observed yield, benchmark, gap and same-season change."
          />
        </Card>
      ) : (
        <>
          <Tabs
            items={YIELD_WORKSPACES.map((item) => ({ id: item.id, label: item.label }))}
            active={workspace}
            onChange={setWorkspace}
            ariaLabel="Yield Intelligence workspaces"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-slate-500">
              {YIELD_WORKSPACES.find((item) => item.id === workspace)?.description}
            </p>
            {/* A contextual action carrying the current scope, not a tab. It is a
                disclosure, so a reader who does not want it is never routed
                through it. */}
            <Link
              className="text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
              href={`/productivity${filterQuery}`}
            >
              Model details and methods
            </Link>
          </div>

          {productivity.error ? (
            <ErrorState
              message={(productivity.error as Error).message}
              onRetry={() => productivity.refetch()}
            />
          ) : null}

          {productivity.isLoading ? <KpiRowSkeleton count={4} /> : null}

          {productivity.data ? (
            <DashboardKpis kpis={productivity.data.kpis} primaryIds={YIELD_KPI_IDS} />
          ) : null}

          {workspace === "summary" ? (
            <div className="space-y-5">
              <YieldOverview
                crop={crop}
                district={filters.district}
                rows={rows}
                yoy={productivity.data?.yoy}
                periodText={periodText}
                isLoading={productivity.isLoading}
                onSelectDistrict={openDistrict}
              />

              {/* A compact shortfall view on the same period as the headline
                  figures, so the size of the gap is on the summary without a
                  second trip. */}
              <YieldGapDistribution
                bands={productivity.data?.gap_bands ?? []}
                isLoading={productivity.isLoading}
                crop={crop}
              />

              {/* Practice associations: context for the shortfall, one deliberate
                  interaction away. The full analysis also lives on Productivity. */}
              <Card>
                <CardHeader
                  title="Related practices"
                  subtitle="Observed district associations with yield — association, not cause"
                />
                <SourceDisclosure summary="Show associated practices">
                  <div className="grid gap-5 px-4 pb-4 pt-2 xl:grid-cols-[3fr_2fr]">
                    <FactorAssociationChart
                      data={factors.data}
                      isLoading={factors.isLoading}
                      crop={crop}
                    />
                    <PracticesContext
                      note={factors.data?.note}
                      periodText={periodText}
                      provenancePeriod={factors.data?.provenance.reference_period ?? "2025B"}
                    />
                  </div>
                </SourceDisclosure>
              </Card>

              {/* The explanation of the figures immediately above it. */}
              <Card>
                <CardHeader
                  title="Explain this selection"
                  subtitle="A grounded answer about the crop, period and district currently selected"
                />
                <SourceDisclosure summary="Ask about this selection">
                  <div className="px-4 pb-4 pt-2">
                    <AIExplainPanel
                      context={{
                        page: "yield-intelligence",
                        metric: mapMetric,
                        period_code: periodCode,
                        crop,
                        district: filters.district,
                        province: filters.province,
                        benchmark_strategy: filters.benchmark,
                      }}
                      prompts={aiPrompts}
                    />
                  </div>
                </SourceDisclosure>
              </Card>

              {productivity.data ? (
                <SourceDisclosure summary="Sources and method for these figures">
                  <ProvenanceCard provenance={productivity.data.provenance} />
                </SourceDisclosure>
              ) : null}
            </div>
          ) : null}

          {workspace === "trends" ? (
            <div className="space-y-5">
              <div className="card flex flex-wrap items-center gap-3 px-4 py-2.5">
                <TrendCompareControl
                  value={compareTarget}
                  onChange={setCompareTarget}
                  primaryDistrict={filters.district}
                />
                <p className="text-[11px] text-slate-500">
                  Overlays a second published yield series on the same period axis. A period only one
                  side published is drawn on that side alone.
                </p>
              </div>
              <YieldOverTimeChart
                data={trend.data}
                isLoading={trend.isLoading}
                crop={crop}
                district={filters.district}
                season={season}
                mode={trendMode}
                onModeChange={setTrendMode}
                comparison={comparisonData}
                comparisonLabel={comparisonLabel}
              />
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-slate-600">
                <span>
                  Gap distribution, benchmark formulas, practice associations and model cards live on
                  the productivity workspace, filtered to this same selection.
                </span>
                <Link
                  className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
                  href={`/productivity${filterQuery}`}
                >
                  Open the detailed gap view
                </Link>
              </Card>
            </div>
          ) : null}

          {workspace === "map" ? (
            <div className="space-y-5">
              <RwandaDistrictMap
                data={mapMetrics.data}
                metric={mapMetric}
                onMetricChange={setMapMetric}
                onSelectDistrict={openDistrict}
                selectedDistrict={filters.district}
                height={520}
                title={`District ${mapMetric} — ${crop}`}
              />
              <DistrictRankingTable rows={rows} onSelectDistrict={openDistrict} />
              <p className="px-1 text-xs text-slate-500">
                Click a district on the map or in the ranking to open its published detail.
              </p>
            </div>
          ) : null}

          {workspace === "planning" ? (
            <div className="space-y-5">
              {/* The publication gate first: whether a validated forecast exists
                  determines what the rest of this workspace can claim. It renders
                  whatever the backtest decided — including "no forecast may be
                  served", with the reasons — so the absence of a forecast is
                  explained rather than hidden. */}
              <ForecastPanel filters={filters} />

              {/* The user-controlled projection, kept visually and verbally separate
                  from the validated-forecast status above: it answers what would
                  follow from stated assumptions, never what will happen. */}
              <details className="border-y border-forest/10">
                <summary className="flex cursor-pointer items-center justify-between gap-3 py-3 text-sm font-semibold text-forest-deep outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <span>Build a manual planning projection</span>
                  <span className="text-xs font-normal text-slate-500">Optional · your assumptions</span>
                </summary>
                <div className="pb-1 pt-2">
                  <ManualProjectionWorkspace filters={filters} />
                </div>
              </details>

              {/* Period and benchmark assumptions, compared against the current
                  selection. */}
              <details className="border-b border-forest/10">
                <summary className="flex cursor-pointer items-center justify-between gap-3 py-3 text-sm font-semibold text-forest-deep outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <span>Compare analytical scenarios</span>
                  <span className="text-xs font-normal text-slate-500">Optional · published data only</span>
                </summary>
                <div className="pb-1 pt-2">
                  <SimulationLab
                    crop={crop}
                    periodCode={periodCode}
                    province={filters.province}
                    district={filters.district}
                    benchmark={filters.benchmark}
                  />
                </div>
              </details>

              <Card className="space-y-2 p-4 text-xs text-slate-600">
                <p>
                  Planning results are your assumptions, not an official NISR figure and not a
                  validated model forecast. The published forecast status above is the only place a
                  model estimate can appear.
                </p>
                <p className="flex flex-wrap gap-x-4 gap-y-1">
                  <Link
                    className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
                    href={`/interventions${filterQuery}`}
                  >
                    Intervention-weight scenarios
                  </Link>
                  <Link
                    className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
                    href="/transparency"
                  >
                    Model cards and methods
                  </Link>
                </p>
              </Card>
            </div>
          ) : null}

          {drawerDistrict ? (
            <DistrictYieldDrawer
              district={drawerDistrict}
              crop={crop}
              periodText={periodText}
              row={selectedRow}
              yoy={drawerHasSelection ? productivity.data?.yoy : null}
              trend={drawerHasSelection ? trend.data?.points : undefined}
              onClose={() => setDrawerDistrict(null)}
              onAskAi={() => {
                setDrawerDistrict(null);
                // The explanation lives on Summary, next to the figures it explains.
                setWorkspace("summary");
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/** Explains that the factor association comes from a different release. */
function PracticesContext({
  note,
  periodText,
  provenancePeriod,
}: {
  note?: string | null;
  periodText?: string | null;
  provenancePeriod?: string | null;
}) {
  const release = periodLabel(provenancePeriod ?? "2025B");
  const differs = Boolean(
    provenancePeriod && periodText && periodLabel(provenancePeriod) !== periodText,
  );

  return (
    <Card className="h-fit">
      <CardHeader title="Practice data release" subtitle="Why the period differs from the charts above" />
      <div className="space-y-2 px-4 pb-2 pt-3 text-xs text-slate-600">
        {differs ? (
          <p className="rounded-lg border border-amber/25 bg-amber/[0.06] p-3">
            <span className="mr-1.5 rounded-sm bg-amber/15 px-1.5 py-0.5 font-semibold text-amber">
              Reference period: {release}
            </span>
            This model component reads the legacy single-release district practice extract for{" "}
            {release}. The multi-period practice observations are served separately by the practice
            indicators endpoint, so this section is <strong>not</strong> a measurement of{" "}
            {periodText ?? "the selected period"}.
          </p>
        ) : (
          <p>
            Practice-adoption data come from the {release} district survey, which matches the period
            selected above.
          </p>
        )}
        {note ? <p className="text-amber-700">{note}</p> : null}
        <p className="rounded-lg border border-danger/25 bg-danger/[0.05] p-3 font-semibold text-danger">
          ASSOCIATION IS NOT CAUSATION
        </p>
        <p className="text-slate-500">
          These are district-level correlations between reported adoption and observed yield, and
          confounding between practices is expected.
        </p>
      </div>
      <SourceNote>
        Source: NISR SAS district practice/land survey. Yield figures elsewhere on this page come
        from the crop productivity panel for the selected period.
      </SourceNote>
    </Card>
  );
}
