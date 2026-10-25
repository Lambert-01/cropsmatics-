"use client";

import { AlertTriangle, ChevronDown, FlaskConical, Info, Loader2, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { BENCHMARK_OPTIONS, DEFAULT_BENCHMARK } from "@/lib/filters";
import { benchmarkLabel, fmtNumber, fmtPct, periodLabel } from "@/lib/format";
import { formatScenarioValue, previousPeriod, scenarioCriteria } from "@/lib/scenario";
import { useScenario } from "@/services/hooks/useAnalytics";
import { useDistricts, usePeriods } from "@/services/hooks/useReference";
import type { ScenarioParams, ScenarioView } from "@/types";

import { AIExplainPanel } from "./AIExplainPanel";
import { RankingMovement } from "./RankingMovement";

/** Matches the API's own default, so "unchanged" really means unchanged. */
const DEFAULT_THRESHOLD_PCT = 25;

function SummaryCard({
  title,
  view,
  threshold,
  tone,
}: {
  title: string;
  view: ScenarioView;
  threshold: number;
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
          No published {view.crop} district rows for this selection.
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
        {view.province ? `${view.province} province` : "all districts"} ·{" "}
        {benchmarkLabel(view.benchmark_strategy)}
      </p>
      {/* The benchmark covers the whole crop, not the chosen group, so a smaller
          group never quietly raises the reference level. */}
      <p className="text-[10px] text-slate-400">
        Benchmark measured over {fmtNumber(view.stats.n_benchmark_districts, 0)} published districts
      </p>

      <dl className="mt-2.5 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-slate-500">Below benchmark</dt>
          <dd className="text-sm font-semibold tabular-nums text-forest-deep">
            {fmtNumber(view.stats.n_below_benchmark, 0)}
            <span className="ml-1 text-[10px] font-normal text-slate-400">
              of {fmtNumber(view.stats.n_districts, 0)}
            </span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-slate-500">
            High-priority band (≥ {fmtPct(threshold, 0)})
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-forest-deep">
            {fmtNumber(view.stats.n_below_threshold, 0)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-slate-500">Mean gap index</dt>
          <dd className="text-sm font-semibold tabular-nums text-forest-deep">
            {fmtPct(view.stats.mean_gap_index, 1)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

/**
 * Yield Scenario Lab.
 *
 * An *analytical* scenario: it re-runs the published yield analytics under a
 * different set of reviewable assumptions and shows exactly what changes. It is
 * not a forecast and not an intervention model, and it says so on every result.
 *
 * The baseline is pinned to the page's current selection and is never overwritten
 * by the scenario — both sides are returned in one response, so the comparison is
 * always between two stated sets of assumptions.
 */
export function SimulationLab({
  crop,
  periodCode,
  province,
  district,
  benchmark,
}: {
  crop: string;
  periodCode?: string;
  province?: string;
  district?: string;
  benchmark?: string;
}) {
  const periods = usePeriods();
  const districts = useDistricts();
  const scenario = useScenario();

  const availablePeriods = periods.data?.periods?.map((p) => p.period_code) ?? [];
  const defaultPeriod = useMemo(
    () => previousPeriod(availablePeriods, periodCode),
    [availablePeriods, periodCode],
  );

  const [scenarioPeriod, setScenarioPeriod] = useState(defaultPeriod);
  const [scenarioBenchmark, setScenarioBenchmark] = useState(benchmark ?? DEFAULT_BENCHMARK);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD_PCT);
  const [scenarioProvince, setScenarioProvince] = useState(province ?? "");
  const [criterion, setCriterion] = useState("gap_index");

  // Keep the scenario period sensible once the catalogue arrives (or the page
  // selection changes), without stomping a value the user has already chosen.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && defaultPeriod) setScenarioPeriod(defaultPeriod);
  }, [defaultPeriod]);

  const provinceOptions = useMemo(() => {
    const names = new Set<string>();
    (districts.data ?? []).forEach((d) => {
      if (d.province) names.add(d.province);
    });
    return Array.from(names).sort();
  }, [districts.data]);

  const criteria = scenarioCriteria(scenario.data?.available_ranking_criteria);

  // The earliest published release has no earlier period, so there is nothing
  // honest to compare it with. Refuse to run instead of letting the API fall
  // back to the latest period, which would silently compare unrelated releases.
  const hasComparison = Boolean(scenarioPeriod);

  const run = () => {
    if (!hasComparison) return;
    const baseline: ScenarioParams = {
      period_code: periodCode ?? undefined,
      benchmark_strategy: benchmark ?? DEFAULT_BENCHMARK,
      gap_threshold_pct: DEFAULT_THRESHOLD_PCT,
      province: province ?? undefined,
      ranking_criterion: "gap_index",
    };
    const next: ScenarioParams = {
      period_code: scenarioPeriod || undefined,
      benchmark_strategy: scenarioBenchmark,
      gap_threshold_pct: threshold,
      province: scenarioProvince || undefined,
      ranking_criterion: criterion,
    };
    scenario.mutate({ crop, baseline, scenario: next });
  };

  // Run once when the tab opens so the lab is never a blank form, then on demand.
  const ranOnce = useRef(false);
  useEffect(() => {
    if (ranOnce.current || !crop || !periodCode || !hasComparison) return;
    ranOnce.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, periodCode, hasComparison]);

  const result = scenario.data;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Yield Scenario Lab"
          subtitle="Change the analytical assumptions and see exactly what moves"
          action={
            <span className="rounded-full bg-info/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-info">
              Analytical scenario
            </span>
          }
        />

        <div className="flex items-start gap-2 px-4 pt-3 text-[11px] text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
          <span>
            This re-computes <strong>{crop}</strong> from published observations under different
            assumptions. It is <strong>not a prediction</strong> and does not estimate what an
            intervention would achieve.
          </span>
        </div>

        <div className="grid gap-3 px-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Comparison period"
            hint={`Baseline stays ${periodLabel(periodCode) || "the page selection"}`}
          >
            <select
              className="input w-full"
              value={scenarioPeriod}
              onChange={(event) => {
                touched.current = true;
                setScenarioPeriod(event.target.value);
              }}
            >
              {availablePeriods.length === 0 && scenarioPeriod ? (
                <option value={scenarioPeriod}>{periodLabel(scenarioPeriod)}</option>
              ) : null}
              {availablePeriods.map((code) => (
                <option key={code} value={code}>
                  {periodLabel(code)}
                  {code === periodCode ? " (baseline)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Benchmark strategy">
            <select
              className="input w-full"
              value={scenarioBenchmark}
              onChange={(event) => setScenarioBenchmark(event.target.value)}
            >
              {BENCHMARK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Gap threshold (%)" hint="Flags the high-priority band">
            <input
              className="input w-full"
              type="number"
              min={0}
              max={200}
              step={5}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </Field>

          <Field label="District group" hint="Benchmark is recomputed within the group">
            <select
              className="input w-full"
              value={scenarioProvince}
              onChange={(event) => setScenarioProvince(event.target.value)}
            >
              <option value="">All districts</option>
              {provinceOptions.map((name) => (
                <option key={name} value={name}>
                  {name} province
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ranking criterion">
            <select
              className="input w-full"
              value={criterion}
              onChange={(event) => setCriterion(event.target.value)}
            >
              {criteria.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.unit ? ` (${item.unit})` : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={run}
              disabled={scenario.isPending || !crop || !hasComparison}
            >
              {scenario.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Run scenario
            </button>
          </div>
        </div>

        {district ? (
          <p className="px-4 pt-2 text-[11px] text-slate-400">
            The page is filtered to {district}; a scenario compares district groups, so the group
            selector above is what drives this result.
          </p>
        ) : null}
      </Card>

      {!hasComparison ? (
        <Card className="flex items-start gap-2 p-4 text-xs text-slate-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
          <span>
            {periodLabel(periodCode) || "The selected period"} is the earliest published release, so
            there is no earlier period to compare it against. A scenario needs two sides; pick a
            later period on the page filter to open this lab.
          </span>
        </Card>
      ) : null}

      {scenario.isError ? (
        <ErrorState
          message={(scenario.error as Error).message}
          onRetry={run}
        />
      ) : null}

      {hasComparison && !result && !scenario.isPending && !scenario.isError ? (
        <Card>
          <EmptyState
            title="Run a scenario to compare two sets of assumptions."
            hint="Choose a period, benchmark strategy or threshold above, then run the scenario. Nothing is predicted — only published observations are re-computed."
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
              threshold={result.baseline.gap_threshold_pct}
              tone="baseline"
            />
            <SummaryCard
              title="Scenario"
              view={result.scenario}
              threshold={result.scenario.gap_threshold_pct}
              tone="scenario"
            />
          </div>

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
          ) : (
            <Card className="flex items-start gap-2 p-4 text-xs text-slate-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <span>
                Both sides use identical assumptions, so nothing changed. Adjust a control above and
                run the scenario again.
              </span>
            </Card>
          )}

          <RankingMovement
            movement={result.ranking_movement}
            baselineLabel={result.baseline.period_label ?? "baseline"}
            scenarioLabel={result.scenario.period_label ?? "scenario"}
          />

          <ModelScenarioPanel mode={result.model_scenario} />

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
                {result.provenance.source_period ?? "—"} · baseline strategy{" "}
                {benchmarkLabel(result.provenance.benchmark_strategy)}
              </SourceNote>
            </Card>
          ) : null}

          <AIExplainPanel
            title="Explain this scenario"
            context={{
              page: "yield-intelligence",
              metric: "scenario",
              period_code: result.scenario.period_code ?? undefined,
              crop,
              province: result.scenario.province ?? undefined,
              benchmark_strategy: result.scenario.benchmark_strategy,
            }}
            prompts={[
              `Explain the ${crop} scenario comparing ${result.baseline.period_label} with ${result.scenario.period_label}`,
              `Which districts are furthest below the ${crop} benchmark?`,
              "What data are missing for this selection?",
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Mode B, model-based scenario.
 *
 * Off unless a validated model card for a yield target is actually registered.
 * It is rendered rather than hidden so the distinction between "we can re-compute
 * observations" and "we cannot yet model an intervention" is visible, and so the
 * controls can never be mistaken for a causal lever.
 */
function ModelScenarioPanel({
  mode,
}: {
  mode: {
    available: boolean;
    reason: string;
    model_name?: string | null;
    model_version?: string | null;
  };
}) {
  return (
    <Card className="border-dashed">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-forest-deep">Model-based scenario</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Open only when you need model validation details
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {mode.available ? "Available" : "Not available"}
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </span>
        </summary>
        <div className="border-t border-forest/5">
          <div className="flex items-start gap-2 px-4 pb-3 pt-3 text-[11px] text-slate-500">
            {mode.available ? (
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
            )}
            <span>
              {mode.reason}
              {mode.model_name ? (
                <>
                  {" "}
                  Registered model: <strong>{mode.model_name}</strong>
                  {mode.model_version ? ` (${mode.model_version})` : ""}.
                </>
              ) : null}
            </span>
          </div>
          <SourceNote>
            A model-based scenario reports a fitted model&apos;s output, never a guaranteed intervention
            outcome. It stays disabled until a validated yield model card exists in{" "}
            <code>ml/reports</code>, because an unreliable model presented as an intervention effect is
            worse than no model at all.
          </SourceNote>
        </div>
      </details>
    </Card>
  );
}
