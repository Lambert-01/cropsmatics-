"use client";

import { ArrowDownRight, ArrowUpRight, Minus, Sprout } from "lucide-react";
import { useState } from "react";

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
import { SimulationLab } from "@/features/yield-intelligence/SimulationLab";
import {
  YieldGapDistribution,
} from "@/features/yield-intelligence/YieldGapDistribution";
import {
  YieldOverTimeChart,
  type YieldTrendMode,
} from "@/features/yield-intelligence/YieldOverTimeChart";
import type { MapMetricId } from "@/lib/constants";
import { splitPeriod } from "@/lib/filters";
import { periodLabel, fmtNumber } from "@/lib/format";
import {
  useFactors,
  useMapMetrics,
  useProductivity,
  useProductivityTrend,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

/**
 * Yield Intelligence.
 *
 * Headline set is declared here rather than inherited from response order: at
 * most four cards, all crop-specific and all for the selected period.
 */
const YIELD_KPI_IDS = ["mean_yield", "benchmark_yield", "gap_shortfall", "yoy_yield"];

/**
 * Analytical workspaces.
 *
 * ``explorer`` is the existing evidence view; ``simulation`` is the Scenario Lab.
 * The wider OVERVIEW/TRENDS/SPATIAL/GAPS/DRIVERS split is a later step — these
 * two are the ones that are fully implemented today, so no tab is offered that
 * cannot deliver.
 */
const YIELD_TABS = [
  { id: "explorer", label: "Evidence explorer" },
  { id: "simulation", label: "Scenario Lab" },
];

export default function YieldIntelligencePage() {
  const { filters } = useFilters();
  const [trendMode, setTrendMode] = useState<YieldTrendMode>("same_season");
  const [mapMetric, setMapMetric] = useState<MapMetricId>("yield");
  const [tab, setTab] = useState<string>("explorer");

  const crop = filters.crop;
  const periodCode = filters.period;
  const { season } = splitPeriod(periodCode);

  const productivity = useProductivity(filters, Boolean(crop));
  const trend = useProductivityTrend(crop, filters.district, undefined, Boolean(crop));
  const mapMetrics = useMapMetrics(filters, mapMetric, Boolean(crop));
  const factors = useFactors(filters, Boolean(crop));

  const yoy = productivity.data?.yoy;
  const periodText = periodCode ? periodLabel(periodCode) : (productivity.data?.period ?? null);

  return (
    <div className="space-y-5">
      <PageHero
        title="Yield Intelligence"
        subtitle="Understand how crop yields vary across seasons and districts, where yield gaps exist, and which observed factors warrant investigation."
      />

      <AnalyticsFilterBar />

      <Tabs
        items={YIELD_TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Yield Intelligence workspaces"
      />

      {!crop ? (
        <Card>
          <EmptyState
            title="Select a crop to open Yield Intelligence."
            hint="Yield is only comparable within a crop — maize, beans and potato kg/ha sit on different natural scales. Pick a crop above and this page fills with its observed yield, benchmark, gap and same-season change."
          />
        </Card>
      ) : null}

      {crop && productivity.error ? (
        <ErrorState
          message={(productivity.error as Error).message}
          onRetry={() => productivity.refetch()}
        />
      ) : null}

      {crop && productivity.isLoading ? <KpiRowSkeleton count={4} /> : null}

      {crop && productivity.data ? (
        <>
          {/* Four headline cards: observed yield, benchmark, typical gap, YoY change. */}
          <DashboardKpis kpis={productivity.data.kpis} primaryIds={YIELD_KPI_IDS} />

          {/* Same-season change, stated in full rather than as a bare percentage. */}
          <YoYInsight
            crop={crop}
            district={filters.district}
            yoy={yoy}
            periodText={periodText}
          />
        </>
      ) : null}

      {tab === "explorer" ? (
        <>
      {/* SECTION 1 — yield over time */}
      {crop ? (
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

      {/* SECTION 2 — district yield map (crop is required by the API) */}
      {crop ? (
        <RwandaDistrictMap
          data={mapMetrics.data}
          metric={mapMetric}
          onMetricChange={setMapMetric}
          selectedDistrict={filters.district}
          height={520}
          title={`District ${mapMetric === "yield" ? "yield" : "gap"} — ${crop}`}
        />
      ) : null}

      {/* SECTION 3 — district ranking */}
      {crop ? <DistrictRankingTable rows={productivity.data?.rows ?? []} /> : null}

      {/* SECTION 4 — yield gap distribution */}
      {crop ? (
        <YieldGapDistribution
          bands={productivity.data?.gap_bands ?? []}
          isLoading={productivity.isLoading}
          crop={crop}
        />
      ) : null}

      {/* SECTION 5 — associated practices, with the release difference stated */}
      {crop ? (
        <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
          <FactorAssociationChart data={factors.data} isLoading={factors.isLoading} crop={crop} />
          <PracticesContext
            note={factors.data?.note}
            periodText={periodText}
            provenancePeriod={factors.data?.provenance.reference_period ?? "2025B"}
          />
        </div>
      ) : null}

      {/* SECTION 6 — model performance, observed vs modelled kept separate */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ModelPerformancePanel />
        <ObservedVsModelled />
      </div>

      {/* SECTION 7 — contextual grounded explanation */}
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
        prompts={
          crop
            ? [
                `Explain the ${crop} yield pattern${filters.district ? ` in ${filters.district}` : ""}`,
                "Which districts are furthest below the benchmark?",
                "What data are missing for this selection?",
              ]
            : [
                "What data are missing for this selection?",
                "Which crops have published yield data?",
                "What should I investigate next?",
              ]
        }
      />

      {productivity.data ? <ProvenanceCard provenance={productivity.data.provenance} /> : null}
        </>
      ) : null}

      {/* SECTION 8 — Scenario Lab (analytical scenario, never a prediction) */}
      {tab === "simulation" && crop ? (
        <SimulationLab
          crop={crop}
          periodCode={periodCode}
          province={filters.province}
          district={filters.district}
          benchmark={filters.benchmark}
        />
      ) : null}

      {tab === "simulation" && !crop ? (
        <Card>
          <EmptyState
            title="Select a crop to open the Scenario Lab."
            hint="A scenario ranks districts within a crop, and yields are only comparable within a crop, so a crop has to be selected first."
          />
        </Card>
      ) : null}
    </div>
  );
}

/** The same-season change, written out with both periods and both values. */
function YoYInsight({
  crop,
  district,
  yoy,
  periodText,
}: {
  crop: string;
  district?: string;
  yoy?: {
    available: boolean;
    reason?: string | null;
    previous_period_label?: string | null;
    current_yield_kg_ha?: number | null;
    previous_yield_kg_ha?: number | null;
    change_pct?: number | null;
  } | null;
  periodText?: string | null;
}) {
  const scope = district ? `in ${district}` : "across all districts";

  if (!yoy) {
    return (
      <Card className="flex items-start gap-2 p-4 text-xs text-slate-500">
        <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          A same-season comparison needs a published period. Choose a period above to compare{" "}
          {crop} yield with the same season one year earlier.
        </span>
      </Card>
    );
  }

  if (!yoy.available) {
    return (
      <Card className="flex items-start gap-2 p-4 text-xs text-slate-500">
        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
        <span>
          No same-season comparison is available for {crop} {scope}.{" "}
          {yoy.reason ?? "The previous year has no published release for this selection."}
        </span>
      </Card>
    );
  }

  const up = (yoy.change_pct ?? 0) > 0;
  const flat = (yoy.change_pct ?? 0) === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          flat
            ? "bg-slate-100 text-slate-600"
            : up
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
        }`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {flat ? "unchanged" : `${up ? "+" : ""}${fmtNumber(yoy.change_pct ?? null, 1)}%`}
      </span>
      <p className="text-xs text-slate-600">
        {crop} mean observed yield {scope} was{" "}
        <strong className="text-forest-deep">
          {fmtNumber(yoy.current_yield_kg_ha ?? null, 0)} kg/ha
        </strong>{" "}
        in {periodText ?? "the selected period"}, versus{" "}
        <strong className="text-forest-deep">
          {fmtNumber(yoy.previous_yield_kg_ha ?? null, 0)} kg/ha
        </strong>{" "}
        in {yoy.previous_period_label ?? "the previous year"}. Same season, one year apart — seasons
        differ agronomically, so consecutive seasons are not a time series.
      </p>
    </Card>
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
  const differs = Boolean(provenancePeriod && periodText && periodLabel(provenancePeriod) !== periodText);

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
        <p className="text-slate-500">
          Association is not causation: these are district-level correlations between reported
          adoption and observed yield, and confounding between practices is expected.
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
