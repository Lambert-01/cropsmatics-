"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";

import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import { PriorityBadge } from "@/components/ui/Badge";
import { SourceNote } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import { headlinePriorities, investigationAreas } from "@/lib/priority";
import type { MapMetricId } from "@/lib/constants";
import type { DashboardFilters } from "@/lib/filters";
import {
  useMapMetrics,
  usePriorities,
  useWeightedPriorities,
  useWeightedPriorityMap,
} from "@/services/hooks/useAnalytics";
import type { ComponentAvailability, PriorityRow } from "@/types";

import { AIExplainPanel } from "../yield-intelligence/AIExplainPanel";
import { ComponentAvailabilityNotice } from "./ComponentAvailabilityNotice";
import { DistrictRationale } from "./DistrictRationale";
import { PriorityRanking } from "./PriorityRanking";
import { ScenarioComparison } from "./ScenarioComparison";
import { ScoreComponentChart } from "./ScoreComponentChart";
import { DEFAULT_WEIGHTS, WeightsPanel, type Weights } from "./WeightsPanel";

/** How many candidates the headline answer shows before the full table takes over. */
const HEADLINE_ROWS = 5;

/**
 * PRIORITIES workspace.
 *
 * The planner's transparent, adjustable weighting over the published district ×
 * crop candidates. The weights change what is *ranked*; they never change what is
 * measured — the score is recomputed by the Python engine on the server, and both
 * the baseline and the adjusted ranking come back, so no comparison is a
 * browser re-sort.
 *
 * Layout principle: **the answer comes first**. The previous version opened on
 * the 300px weights panel, so a visitor had to read an advanced control before
 * seeing a single ranked district. Now the page leads with the ranked answer and
 * the evidence behind it, the map and rationale sit directly underneath, and the
 * weighting lives behind an explicit "Adjust weighting" disclosure. Every
 * existing panel is still mounted and still functional — nothing was removed to
 * simplify the layout.
 */
export function PrioritiesWorkspace({ filters }: { filters: DashboardFilters }) {
  const baseline = usePriorities(filters, 60, true);
  const weighted = useWeightedPriorities(filters);
  const weightedMap = useWeightedPriorityMap(filters);
  const [metric, setMetric] = useState<MapMetricId>("priority");
  const map = useMapMetrics(filters, metric, true);

  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [scenarioKey, setScenarioKey] = useState<string | null>(null);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const filterKey = JSON.stringify(filters);
  // A scenario is only "applied" while the filters have not moved underneath it
  // and the sliders have not been touched since it was run. Anything else would
  // present a stale weighting as the active one.
  const scenarioActive = scenarioKey === filterKey && !dirty;

  const rows = useMemo(
    () => (scenarioActive ? weighted.data?.rows : null) ?? baseline.data?.rows ?? [],
    [scenarioActive, weighted.data, baseline.data],
  );
  const selected: PriorityRow | null = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const activeSource = scenarioActive ? weighted.data : baseline.data;
  const proxyNotes = useMemo(() => (rows.length ? activeSource?.proxy_notes ?? [] : []), [rows, activeSource]);
  const unavailable: string[] = rows.length ? activeSource?.components_unavailable ?? [] : [];
  const availability: ComponentAvailability[] = activeSource?.component_availability ?? [];
  const isLoading = baseline.isLoading;

  // Both helpers are pure and unit tested: the headline takes a prefix of the
  // engine's order (never a browser re-sort), and the "where to start" list is
  // one candidate per district.
  const headline = useMemo(() => headlinePriorities(rows, HEADLINE_ROWS), [rows]);
  const startAreas = useMemo(() => investigationAreas(rows, 6), [rows]);

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

  const clearScenario = () => {
    setWeights(DEFAULT_WEIGHTS);
    setScenarioKey(null);
    setDirty(false);
    weighted.reset();
    weightedMap.reset();
  };

  return (
    <div className="space-y-5">
      {baseline.error ? (
        <ErrorState message={(baseline.error as Error).message} onRetry={() => baseline.refetch()} />
      ) : null}

      {scenarioActive ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5"
          role="status"
        >
          <p className="text-xs text-amber-900">
            <span className="font-semibold">Scenario applied.</span> The ranking below uses your
            adjusted weights, not the baseline. This is a reviewable what-if, not a prediction.
          </p>
          <button type="button" className="btn px-2 py-1 text-xs" onClick={clearScenario}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Back to baseline
          </button>
        </div>
      ) : null}

      {/*
        The answer. Ranked candidates with the evidence behind them, rendered
        before any control, so the page is useful on first paint.
      */}
      <section className="card overflow-hidden" aria-labelledby="priorities-answer-heading">
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
          <div>
            <h2 id="priorities-answer-heading" className="card-title">
              Top intervention priorities
            </h2>
            <p className="card-subtitle mt-1">
              District × crop observations, highest priority score first. Selection:{" "}
              {filters.period || "latest published period"}
              {filters.crop ? ` · ${filters.crop}` : ""}
              {filters.province ? ` · ${filters.province}` : ""}
              {filters.district ? ` · ${filters.district}` : ""}.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            {isLoading ? "Loading…" : `${rows.length} candidate${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : headline.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-600">
            No district × crop candidates for this selection. The published panel may not carry
            district rows for this period — widen the period or clear the crop filter.
          </p>
        ) : (
          <ul className="divide-y divide-forest/10">
            {headline.map((row, index) => {
              const isSelected = selected?.id === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                      isSelected ? "bg-forest/[0.06]" : "hover:bg-slate-50",
                    )}
                  >
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {row.district}
                        <span className="font-normal text-slate-500"> · {row.crop}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Gap {fmtNumber(row.gap, 1)}% · score {fmtNumber(row.score * 100, 0)}/100
                      </span>
                    </span>
                    <PriorityBadge band={row.band} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <SourceNote>
          Priority score = weighted, min-max normalised components; cost is subtracted. Decision
          support only — it ranks where to look, and is not a forecast of yield or a binding
          decision.
        </SourceNote>
      </section>

      {/* Map and rationale read the same selection, so they can never disagree. */}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <RwandaDistrictMap
          data={scenarioActive && metric === "priority" ? weightedMap.data ?? map.data : map.data}
          metric={metric}
          onMetricChange={setMetric}
          selectedDistrict={selected?.district}
          onSelectDistrict={(district) =>
            setSelectedId(rows.find((row) => row.district === district)?.id ?? null)
          }
          height={380}
          title={scenarioActive && metric === "priority" ? "Adjusted priority map" : "Priority map"}
        />
        <DistrictRationale row={selected} proxyNotes={proxyNotes} />
      </div>

      {/* Advanced control, available but not in the way of the answer. */}
      <section className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setWeightsOpen((open) => !open)}
          aria-expanded={weightsOpen}
          aria-controls="intervention-weights"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Adjust weighting</span>
              <span className="block text-xs text-slate-500">
                {scenarioActive
                  ? "A scenario is applied; open to change or reset it."
                  : "Baseline weights are in use. Open to test a reviewable scenario."}
              </span>
            </span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-slate-400 transition", weightsOpen && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {weightsOpen ? (
          <div id="intervention-weights" className="border-t border-forest/10 p-4">
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
          </div>
        ) : null}
      </section>

      {weighted.error || weightedMap.error ? (
        <ErrorState
          message={((weighted.error ?? weightedMap.error) as Error).message}
          onRetry={run}
        />
      ) : null}

      {unavailable.length || availability.length ? (
        <ComponentAvailabilityNotice unavailable={unavailable} availability={availability} />
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
              {startAreas.map((r) => (
                <li key={r.district} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{r.district}</span>
                  <span className="text-slate-500">
                    {r.crop} · score {Math.round(r.score * 100)}
                  </span>
                </li>
              ))}
              {startAreas.length === 0 ? (
                <li className="text-xs text-slate-500">No candidates for this selection.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      <AIExplainPanel
        title="Explain these priorities"
        context={{
          page: "interventions",
          metric: "priority",
          period_code: filters.period,
          crop: filters.crop,
          district: filters.district,
          province: filters.province,
          benchmark_strategy: filters.benchmark,
        }}
        prompts={[
          "Which district and crop combinations are the highest priorities, and why?",
          "What evidence supports the top-ranked districts?",
          "What data are missing for this selection?",
        ]}
      />

      <SourceNote>
        There is no verified budget, projected yield gain or farmer count in the available data, so
        none are shown. The engine uses only documented inputs: priority score, productivity gap,
        harvested-area proxy, readiness proxy, vulnerability proxy and cost proxy. A scenario is a
        re-weighting of the same published observations, never a prediction.
      </SourceNote>
    </div>
  );
}
