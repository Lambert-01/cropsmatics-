"use client";

import { AlertTriangle, FlaskConical, Info, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import type { DashboardFilters } from "@/lib/filters";
import { benchmarkLabel, fmtNumber, periodLabel } from "@/lib/format";
import {
  ENGINE_WEIGHT_KEYS,
  FALLBACK_PRESETS,
  GAP_FOCUSED_WEIGHTS,
  presetFallbackLabel,
  presetToWeights,
} from "@/lib/priority";
import { formatScenarioValue } from "@/lib/scenario";
import { usePriorityScenario } from "@/services/hooks/useAnalytics";
import type { PriorityScenarioResponse, PriorityView } from "@/types";

import { AIExplainPanel } from "../yield-intelligence/AIExplainPanel";
import { PriorityMovement } from "./PriorityMovement";
import { DEFAULT_WEIGHTS, WeightsPanel, type Weights } from "./WeightsPanel";

const DEFAULT_TOP_N = 10;

function weightSummary(weights: Record<string, number>, labels: Record<string, string>): string {
  return ENGINE_WEIGHT_KEYS.map((key) => {
    if (typeof weights[key] !== "number") return null;
    return `${labels[key] ?? key} ${fmtNumber(weights[key], 2)}`;
  })
    .filter(Boolean)
    .join(" · ");
}

function SummaryCard({
  title,
  view,
  labels,
  tone,
}: {
  title: string;
  view: PriorityView;
  labels: Record<string, string>;
  tone: "baseline" | "scenario";
}) {
  const border = tone === "baseline" ? "border-forest/15" : "border-primary/30";

  if (view.missing) {
    return (
      <div className={`rounded-xl border ${border} bg-white/70 p-3`}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {view.period_label ?? "selected period"}
        </p>
        <p className="mt-1.5 text-[11px] text-amber">
          No published {view.crop ? `${view.crop} ` : ""}candidates for this selection.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${border} bg-white/70 p-3`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 text-sm font-semibold text-forest-deep">
        {view.period_label ?? "selected period"}
      </p>
      <p className="text-[11px] text-slate-500">
        {view.district ?? (view.province ? `${view.province} province` : "all districts")}
        {view.crop ? ` · ${view.crop}` : ""} · {benchmarkLabel(view.benchmark_strategy ?? undefined)}
      </p>
      <p className="mt-1 text-[10px] text-slate-400">{weightSummary(view.weights, labels)}</p>

      <dl className="mt-2.5 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-slate-500">Candidates ranked</dt>
          <dd className="text-sm font-semibold tabular-nums text-forest-deep">
            {fmtNumber(view.stats.n_candidates, 0)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-slate-500">In a priority band</dt>
          <dd className="text-sm font-semibold tabular-nums text-forest-deep">
            {fmtNumber(view.stats.n_priority_group, 0)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-slate-500">Review shortlist (top {view.top_n})</dt>
          <dd className="text-sm font-semibold tabular-nums text-forest-deep">
            {fmtNumber(view.stats.n_top_n, 0)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-slate-500">Mean score</dt>
          <dd className="text-sm font-semibold tabular-nums text-forest-deep">
            {fmtNumber(view.stats.mean_score, 3)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Intervention Priority Scenario Lab.
 *
 * An *analytical* scenario: it re-ranks the published district x crop
 * observations under a different set of reviewable planning weights and shows
 * exactly what moves. It is not a budget model, not a yield forecast and not a
 * statement about what an intervention would achieve.
 *
 * The baseline is pinned to the page's current selection and is never
 * overwritten by the scenario — both sides come back in one response, so the
 * comparison is always between two stated sets of assumptions.
 */
export function PriorityScenarioLab({ filters }: { filters: DashboardFilters }) {
  const scenario = usePriorityScenario();

  const [baselineWeights, setBaselineWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [scenarioWeights, setScenarioWeights] = useState<Weights>(GAP_FOCUSED_WEIGHTS);
  const [preset, setPreset] = useState("productivity_gap_focused");
  const [period, setPeriod] = useState("");
  const [topN, setTopN] = useState(DEFAULT_TOP_N);
  const [dirty, setDirty] = useState(false);

  const body = useMemo(
    () => ({
      baseline: {
        weights: baselineWeights,
        period_code: filters.period,
        benchmark_strategy: filters.benchmark,
        province: filters.province,
        district: filters.district,
        crop: filters.crop,
        top_n: topN,
      },
      scenario: {
        weights: scenarioWeights,
        // Empty means "same period as the page selection", which keeps the
        // default comparison a pure re-weighting over an identical candidate set.
        period_code: period || filters.period,
        benchmark_strategy: filters.benchmark,
        province: filters.province,
        district: filters.district,
        crop: filters.crop,
        top_n: topN,
      },
    }),
    [baselineWeights, scenarioWeights, filters, period, topN],
  );

  const run = () => {
    scenario.mutate(body);
    setDirty(false);
  };

  // Run once when the tab opens so the lab is never a blank form, then on demand.
  const ranOnce = useRef(false);
  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result: PriorityScenarioResponse | undefined = scenario.data;

  // Authoritative presets once the API has answered; the local list only keeps
  // the control usable on the very first paint.
  const presetOptions = useMemo(() => {
    const fromApi = result?.available_presets;
    if (fromApi && Object.keys(fromApi).length) {
      return Object.keys(fromApi).map((key) => ({
        key,
        label: result?.preset_labels?.[key] ?? presetFallbackLabel(key),
        weights: presetToWeights(fromApi[key]),
      }));
    }
    return Object.keys(FALLBACK_PRESETS).map((key) => ({
      key,
      label: presetFallbackLabel(key),
      weights: FALLBACK_PRESETS[key],
    }));
  }, [result]);

  const applyPreset = (key: string) => {
    setPreset(key);
    const chosen = presetOptions.find((option) => option.key === key);
    if (chosen) setScenarioWeights(chosen.weights);
    setDirty(true);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <WeightsPanel
          weights={baselineWeights}
          onChange={(w) => {
            setBaselineWeights(w);
            setDirty(true);
          }}
          onReset={() => {
            setBaselineWeights(DEFAULT_WEIGHTS);
            setDirty(true);
          }}
          onRun={run}
          isRunning={scenario.isPending}
          dirty={dirty}
        />

        <Card>
          <CardHeader
            title="Priority Scenario Lab"
            subtitle="Compare two reviewable weightings over the same published candidates"
            action={
              <span className="rounded-full bg-info/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-info">
                Analytical scenario
              </span>
            }
          />

          <div className="flex items-start gap-2 px-4 pt-3 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
            <span>
              This re-ranks published district × crop observations under two sets of weights. It is{" "}
              <strong>not a budget model</strong> and does not estimate what an intervention would
              achieve.
            </span>
          </div>

          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">
                Scenario weighting
              </span>
              <select
                className="input w-full"
                value={preset}
                onChange={(event) => applyPreset(event.target.value)}
              >
                {presetOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[10px] text-slate-400">
                A named planning position, so the comparison is never an arbitrary guess.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">
                Scenario period
              </span>
              <select
                className="input w-full"
                value={period}
                onChange={(event) => {
                  setPeriod(event.target.value);
                  setDirty(true);
                }}
              >
                <option value="">
                  Same as page{filters.period ? ` (${periodLabel(filters.period)})` : ""}
                </option>
                {(result?.available_periods ?? []).map((code) => (
                  <option key={code} value={code}>
                    {periodLabel(code)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">
                Review shortlist size
              </span>
              <input
                className="input w-full"
                type="number"
                min={1}
                max={200}
                value={topN}
                onChange={(event) => {
                  setTopN(Math.max(1, Number(event.target.value)));
                  setDirty(true);
                }}
              />
            </label>
          </div>

          <div className="px-4 pb-4">
            <button
              type="button"
              className="btn btn-primary w-full sm:w-auto"
              onClick={run}
              disabled={scenario.isPending}
            >
              {scenario.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Run scenario
            </button>
          </div>
        </Card>
      </div>

      {scenario.isError ? (
        <ErrorState message={(scenario.error as Error).message} onRetry={run} />
      ) : null}

      {!result && !scenario.isPending && !scenario.isError ? (
        <Card>
          <EmptyState
            title="Run a scenario to compare two sets of weights."
            hint="Pick a scenario weighting above and run the scenario. Nothing is predicted — only published observations are re-ranked."
            icon={<FlaskConical className="h-5 w-5" />}
          />
        </Card>
      ) : null}

      {result ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryCard
              title="Baseline"
              view={result.baseline}
              labels={result.weight_labels}
              tone="baseline"
            />
            <SummaryCard
              title="Scenario"
              view={result.scenario}
              labels={result.weight_labels}
              tone="scenario"
            />
          </div>

          {result.weight_deltas.length ? (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Weighting changes
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.weight_deltas.map((delta) => (
                  <li
                    key={delta.key}
                    className="rounded-lg border border-forest/10 bg-forest/[0.02] px-2.5 py-1.5 text-[11px] text-slate-600"
                  >
                    <span className="font-medium text-slate-700">{delta.label ?? delta.key}: </span>
                    <span className="tabular-nums text-slate-500">
                      {fmtNumber(delta.before, 2)}
                    </span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium tabular-nums text-forest-deep">
                      {fmtNumber(delta.after, 2)}
                    </span>
                    <span
                      className={`ml-1.5 tabular-nums ${
                        (delta.delta ?? 0) > 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {(delta.delta ?? 0) > 0 ? "+" : ""}
                      {fmtNumber(delta.delta, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {result.changes.length ? (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Changed assumptions
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.changes.map((change) => (
                  <li
                    key={change.parameter}
                    className="rounded-lg border border-forest/10 bg-forest/[0.02] px-2.5 py-1.5 text-[11px] text-slate-600"
                  >
                    <span className="font-medium text-slate-700">{change.label}: </span>
                    <span className="text-slate-500">{formatScenarioValue(change.before)}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium text-forest-deep">
                      {formatScenarioValue(change.after)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : result.weight_deltas.length ? null : (
            <Card className="flex items-start gap-2 p-4 text-xs text-slate-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <span>
                Both sides use identical assumptions, so nothing changed. Adjust a control above and
                run the scenario again.
              </span>
            </Card>
          )}

          <PriorityMovement
            movement={result.ranking_movement}
            baselineLabel={result.baseline.label ?? "baseline"}
            scenarioLabel={result.scenario.label ?? "scenario"}
          />

          <Card className="border-dashed">
            <CardHeader
              title="Model-based priority scenario"
              subtitle="Not offered"
              action={
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Not available
                </span>
              }
            />
            <div className="flex items-start gap-2 px-4 pb-3 pt-3 text-[11px] text-slate-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
              <span>
                The platform does not model the effect of an intervention. A fitted model would
                report its own output, not what a district would gain, so no such control is offered
                and none is implied by the weights above.
              </span>
            </div>
            <SourceNote>
              The score is a weighted, min-max normalised sum of published and documented proxy
              components. Weights change what is ranked, never what is measured.
            </SourceNote>
          </Card>

          {result.limitations.length ? (
            <Card>
              <CardHeader title="Limitations" subtitle="What this scenario does not tell you" />
              <ul className="ml-8 list-disc space-y-1 px-4 pb-3 pt-2 text-[11px] text-slate-500">
                {result.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
              <SourceNote>
                Source: {result.provenance.source_id ?? "not stated"} · periods{" "}
                {result.provenance.source_period ?? "—"} · benchmark{" "}
                {benchmarkLabel(result.provenance.benchmark_strategy)}
              </SourceNote>
            </Card>
          ) : null}

          <AIExplainPanel
            title="Explain this scenario"
            context={{
              page: "interventions",
              metric: "priority-scenario",
              period_code: result.scenario.period_code ?? undefined,
              crop: result.scenario.crop ?? undefined,
              district: result.scenario.district ?? undefined,
              province: result.scenario.province ?? undefined,
              benchmark_strategy: result.scenario.benchmark_strategy ?? undefined,
            }}
            prompts={[
              "Which districts are the highest intervention priorities?",
              "Why did the priority ranking change between these weightings?",
              "What data are missing for this selection?",
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
