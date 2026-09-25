"use client";

import { useMemo, useState } from "react";

import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { PageHero } from "@/components/layout/PageHero";
import { ProvenanceCard } from "@/components/ProvenanceCard";
import { CoverageNotice, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { InputAdoptionChart } from "@/features/dashboard/InputAdoptionChart";
import { YieldTrendChart } from "@/features/dashboard/YieldTrendChart";
import { DistrictRationale } from "@/features/interventions/DistrictRationale";
import { PriorityRanking } from "@/features/interventions/PriorityRanking";
import { ScenarioComparison } from "@/features/interventions/ScenarioComparison";
import { ScoreComponentChart } from "@/features/interventions/ScoreComponentChart";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import {
  DEFAULT_WEIGHTS,
  WeightsPanel,
  type Weights,
} from "@/features/interventions/WeightsPanel";
import {
  useInputAdoption, useMapMetrics, useOverview, usePriorities,
  useTrends, useWeightedPriorities, useWeightedPriorityMap,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";
import type { PriorityRow } from "@/types";
import type { MapMetricId } from "@/lib/constants";

export default function InterventionsPage() {
  const { filters } = useFilters();
  const overview = useOverview(filters);
  const districtMode = overview.data?.coverage_level === "district";
  const baseline = usePriorities(filters, 60, districtMode);
  const weighted = useWeightedPriorities(filters);
  const weightedMap = useWeightedPriorityMap(filters);
  const [metric, setMetric] = useState<MapMetricId>("priority");
  const map = useMapMetrics(filters, metric, districtMode);
  const trends = useTrends(filters.crop);
  const inputs = useInputAdoption();

  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [scenarioKey, setScenarioKey] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const scenarioActive = scenarioKey === filterKey && !dirty;

  const rows = useMemo(
    () => (scenarioActive ? weighted.data?.rows : null) ?? baseline.data?.rows ?? [],
    [scenarioActive, weighted.data, baseline.data],
  );
  const selected: PriorityRow | null = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const proxyNotes = useMemo(
    () => (rows.length ? (scenarioActive ? weighted.data?.proxy_notes : null) ?? baseline.data?.proxy_notes ?? [] : []),
    [rows, scenarioActive, weighted.data, baseline.data],
  );

  const investigationAreas = useMemo(() => {
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        if (seen.has(r.district)) return false;
        seen.add(r.district);
        return true;
      })
      .slice(0, 6);
  }, [rows]);

  const run = () => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const normalised = Object.fromEntries(
      Object.entries(weights).map(([k, v]) => [k, Number((v / total).toFixed(3))]),
    ) as Record<string, number>;
    weighted.reset();
    weightedMap.reset();
    weighted.mutate(normalised);
    weightedMap.mutate(normalised);
    setScenarioKey(filterKey);
    setDirty(false);
  };

  return (
    <div className="space-y-5">
      <PageHero
        title="Intervention Planner"
        subtitle="Adjust transparent weights and see how investigation priorities change across Rwanda."
      />

      <AnalyticsFilterBar supported={["year", "season", "crop", "province", "district", "benchmark"]} />

      {overview.error ? <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} /> : null}
      {overview.isLoading ? <KpiRowSkeleton count={4} /> : null}
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

      {districtMode && baseline.error ? (
        <ErrorState message={(baseline.error as Error).message} onRetry={() => baseline.refetch()} />
      ) : null}

      {districtMode ? <>
      <div className="grid gap-5 xl:grid-cols-[300px_1fr_320px]">
        <WeightsPanel
          weights={weights}
          onChange={(w) => {
            setWeights(w);
            setDirty(true);
          }}
          onReset={() => {
            setWeights(DEFAULT_WEIGHTS);
            setDirty(true);
          }}
          onRun={run}
          isRunning={weighted.isPending}
          dirty={dirty}
        />

        <RwandaDistrictMap
          data={scenarioActive && metric === "priority" ? weightedMap.data ?? map.data : map.data}
          metric={metric}
          onMetricChange={setMetric}
          selectedDistrict={selected?.district}
          onSelectDistrict={(district) => setSelectedId(rows.find((row) => row.district === district)?.id ?? null)}
          height={380}
          title={scenarioActive && metric === "priority" ? "Adjusted priority map" : "Priority map"}
        />

        <DistrictRationale row={selected} proxyNotes={proxyNotes} />
      </div>

      {weighted.error || weightedMap.error ? (
        <ErrorState message={(weighted.error ?? weightedMap.error as Error).message} onRetry={run} />
      ) : null}

      <PriorityRanking
        rows={rows}
        isLoading={baseline.isLoading}
        selectedId={selected?.id}
        onSelect={(row) => setSelectedId(row.id)}
      />

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <ScoreComponentChart rows={rows} />
        <div className="space-y-5">
          <ScenarioComparison
            baseline={baseline.data?.rows ?? []}
            adjusted={scenarioActive ? weighted.data?.rows ?? null : null}
          />
          <div className="card p-4">
            <h2 className="card-title">Recommended investigation areas</h2>
            <p className="card-subtitle mt-1">
              Districts appearing most in the top ranks — where review should start.
            </p>
            <ul className="mt-3 space-y-1.5">
              {investigationAreas.map((r) => (
                <li key={r.district} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{r.district}</span>
                  <span className="text-slate-500">
                    {r.crop} · score {Math.round(r.score * 100)}
                  </span>
                </li>
              ))}
              {investigationAreas.length === 0 ? (
                <li className="text-xs text-slate-500">No candidates for this selection.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="card-title">What this page does not claim</h2>
        <p className="mt-1 text-xs text-slate-600">
          There is no verified budget, projected yield gain, or farmer count in the available data,
          so none are shown. The planner works only with defensible, documented inputs: priority
          score, productivity gap, harvested-area proxy, readiness proxy, vulnerability proxy and
          cost proxy.
        </p>
      </div>
      </> : null}
    </div>
  );
}
