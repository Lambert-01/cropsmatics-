"use client";

import { useMemo, useState } from "react";

import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState } from "@/components/ui/States";
import { DistrictRationale } from "@/features/interventions/DistrictRationale";
import { PriorityRanking } from "@/features/interventions/PriorityRanking";
import { ScenarioComparison } from "@/features/interventions/ScenarioComparison";
import { ScoreComponentChart } from "@/features/interventions/ScoreComponentChart";
import {
  DEFAULT_WEIGHTS,
  WeightsPanel,
  type Weights,
} from "@/features/interventions/WeightsPanel";
import { usePriorities, useWeightedPriorities } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";
import type { PriorityRow } from "@/types";

export default function InterventionsPage() {
  const { filters } = useFilters();
  const baseline = usePriorities(filters, 60);
  const weighted = useWeightedPriorities(filters);

  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selected, setSelected] = useState<PriorityRow | null>(null);
  const [dirty, setDirty] = useState(false);

  const rows = useMemo(
    () => weighted.data?.rows ?? baseline.data?.rows ?? [],
    [weighted.data, baseline.data],
  );
  const proxyNotes = useMemo(
    () => (rows.length ? weighted.data?.proxy_notes ?? baseline.data?.proxy_notes ?? [] : []),
    [rows, weighted.data, baseline.data],
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
    weighted.mutate(normalised);
    setDirty(false);
  };

  return (
    <div className="space-y-5">
      <PageHeading
        title="Intervention Planner"
        subtitle="Adjust transparent weights and see how investigation priorities change across Rwanda."
      />

      {baseline.error ? (
        <ErrorState message={(baseline.error as Error).message} onRetry={() => baseline.refetch()} />
      ) : null}

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

        <PriorityRanking
          rows={rows}
          isLoading={baseline.isLoading}
          selectedId={selected?.id}
          onSelect={setSelected}
        />

        <DistrictRationale row={selected} proxyNotes={proxyNotes} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <ScoreComponentChart rows={rows} />
        <div className="space-y-5">
          <ScenarioComparison
            baseline={baseline.data?.rows ?? []}
            adjusted={weighted.data?.rows ?? null}
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
    </div>
  );
}
