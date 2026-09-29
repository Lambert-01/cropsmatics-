"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { PageHero } from "@/components/layout/PageHero";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { FactorAssociationChart } from "@/features/productivity/FactorAssociationChart";
import { ModelPerformancePanel } from "@/features/productivity/ModelPerformancePanel";
import { AIExplainPanel } from "@/features/yield-intelligence/AIExplainPanel";
import { DistrictYieldDrawer } from "@/features/yield-intelligence/DistrictYieldDrawer";
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
  useMapMetrics,
  useProductivity,
  useProductivityTrend,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

/**
 * Yield Intelligence, organised as focused workspaces.
 *
 * This was previously one long scroll of eight stacked analyses. Each workspace
 * below now holds one question, and the selection lives in the URL so a link
 * opens the same workspace it was copied from.
 *
 * Headline set is declared here rather than inherited from response order: at
 * most four cards, all crop-specific and all for the selected period.
 */
const YIELD_KPI_IDS = ["mean_yield", "benchmark_yield", "gap_shortfall", "yoy_yield"];

export default function YieldIntelligencePage() {
  const { filters, setFilters } = useFilters();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const workspace = resolveWorkspace(searchParams.get("workspace"));
  const [trendMode, setTrendMode] = useState<YieldTrendMode>("same_season");
  const [mapMetric, setMapMetric] = useState<MapMetricId>("yield");
  const [drawerDistrict, setDrawerDistrict] = useState<string | null>(null);

  const crop = filters.crop;
  const periodCode = filters.period;
  const { season } = splitPeriod(periodCode);

  // Hooks run unconditionally; the `enabled` flags keep an unselected crop from
  // firing four requests that can only come back empty.
  const productivity = useProductivity(filters, Boolean(crop));
  const trend = useProductivityTrend(crop, filters.district, undefined, Boolean(crop));
  const mapMetrics = useMapMetrics(filters, mapMetric, Boolean(crop));
  const factors = useFactors(filters, Boolean(crop));

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

  function setWorkspace(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("workspace", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
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

  return (
    <div className="space-y-5">
      <PageHero
        title="Yield Intelligence"
        subtitle="Understand how crop yields vary across seasons and districts, where yield gaps exist, and which observed factors warrant investigation."
      />

      <AnalyticsFilterBar />

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

          <p className="px-1 text-xs text-slate-500">
            {YIELD_WORKSPACES.find((item) => item.id === workspace)?.description}
          </p>

          {productivity.error ? (
            <ErrorState
              message={(productivity.error as Error).message}
              onRetry={() => productivity.refetch()}
            />
          ) : null}

          {productivity.isLoading ? <KpiRowSkeleton count={4} /> : null}

          {productivity.data ? (
            <DashboardKpis
              kpis={productivity.data.kpis}
              primaryIds={YIELD_KPI_IDS}
            />
          ) : null}

          {workspace === "overview" ? (
            <YieldOverview
              crop={crop}
              district={filters.district}
              rows={rows}
              yoy={productivity.data?.yoy}
              periodText={periodText}
              isLoading={productivity.isLoading}
              onSelectDistrict={openDistrict}
            />
          ) : null}

          {workspace === "trends" ? (
            <YieldOverTimeChart
              data={trend.data}
              isLoading={trend.isLoading}
              crop={crop}
              district={filters.district}
              season={season}
              mode={trendMode}
              onModeChange={setTrendMode}
            />
          ) : null}

          {workspace === "spatial" ? (
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

          {workspace === "gaps" ? (
            <div className="space-y-5">
              <YieldGapDistribution
                bands={productivity.data?.gap_bands ?? []}
                isLoading={productivity.isLoading}
                crop={crop}
              />
              <DistrictRankingTable rows={rows} onSelectDistrict={openDistrict} />
              <Card className="p-4 text-xs text-slate-600">
                A gap here is measured against each district&apos;s own benchmark for this crop and
                period. Persistence is only claimed when several comparable same-season observations
                agree; a single release never establishes it, and no cause is attributed to a gap.
              </Card>
            </div>
          ) : null}

          {workspace === "drivers" ? (
            <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
              <FactorAssociationChart data={factors.data} isLoading={factors.isLoading} crop={crop} />
              <PracticesContext
                note={factors.data?.note}
                periodText={periodText}
                provenancePeriod={factors.data?.provenance.reference_period ?? "2025B"}
              />
            </div>
          ) : null}

          {workspace === "scenarios" ? (
            <SimulationLab
              crop={crop}
              periodCode={periodCode}
              province={filters.province}
              district={filters.district}
              benchmark={filters.benchmark}
            />
          ) : null}

          {workspace === "ai" ? (
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
              prompts={[
                filters.district
                  ? `Explain ${filters.district} ${crop} yield`
                  : `Explain the ${crop} yield pattern`,
                "Which districts are furthest below the benchmark?",
                "What data are missing for this selection?",
              ]}
            />
          ) : null}

          {workspace === "methodology" ? (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <ModelPerformancePanel />
                <ObservedVsModelled />
              </div>
              {productivity.data ? (
                <ProvenanceCard provenance={productivity.data.provenance} />
              ) : null}
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
                setWorkspace("ai");
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
            Practice-adoption data (improved seed, fertiliser, irrigation, erosion protection,
            agroforestry, mechanization) are published as a single district survey for {release}.
            They are <strong>not</strong> measurements for {periodText ?? "the selected period"}, so
            the association chart must not be read as describing the selected release.
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

/** Keeps observed official data explicitly separate from any modelled value. */
function ObservedVsModelled() {
  return (
    <Card>
      <CardHeader
        title="Observed vs modelled"
        subtitle="What is a measurement and what is a model output"
      />
      <div className="space-y-3 px-4 pb-4 pt-3 text-xs text-slate-600">
        <div className="rounded-lg border border-success/25 bg-success/[0.05] p-3">
          <p className="font-semibold text-success">Observed (official)</p>
          <p className="mt-1">
            All yields, areas, production and gaps on this page are published NISR SAS district
            aggregates. A blank published cell stays blank — it is never imputed, and no value is
            substituted from another period.
          </p>
        </div>
        <div className="rounded-lg border border-info/25 bg-info/[0.05] p-3">
          <p className="font-semibold text-info">Modelled (separate)</p>
          <p className="mt-1">
            Model cards to the left report a fitted model&apos;s error metrics only when a real
            training artifact exists. Model output is never displayed as an observed yield figure and
            is never merged into the district ranking.
          </p>
        </div>
      </div>
      <SourceNote>
        Metrics are reported only when a model card exists in <code>ml/reports</code>. None are
        generated for display.
      </SourceNote>
    </Card>
  );
}
