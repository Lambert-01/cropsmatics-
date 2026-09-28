"use client";

import { AlertTriangle, Info, Loader2, Play, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ResponsiveTable, type Column } from "@/components/table/ResponsiveTable";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import type { DashboardFilters } from "@/lib/filters";
import { fmtNumber, fmtPct } from "@/lib/format";
import { presetFallbackLabel, robustnessLabel } from "@/lib/priority";
import { useSensitivity } from "@/services/hooks/useAnalytics";
import type { SensitivityResponse, SensitivityRow } from "@/types";

import { DEFAULT_WEIGHTS, WeightsPanel, type Weights } from "./WeightsPanel";

const DRAW_OPTIONS = [0, 100, 200, 500, 1000];

/** A robustness share is never colour-alone; it carries a word too. */
function RobustBadge({ row }: { row: SensitivityRow }) {
  const robust = row.robust;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          robust ? "bg-success/10 text-success" : "bg-amber/10 text-amber"
        }`}
      >
        {robust ? "Stable" : "Sensitive"}
      </span>
      <span className="text-[10px] text-slate-500">{robustnessLabel(row.top_n_share_pct)}</span>
    </span>
  );
}

/**
 * Ranking Sensitivity.
 *
 * Re-ranks the planner's own candidates under a sweep of plausible weightings and
 * reports how often each one stayed in the review shortlist. The share is a
 * **robustness share across the tested weightings, not a probability** — nothing
 * here estimates uncertainty in the underlying observations, and the page says so
 * wherever a share appears.
 */
export function SensitivityLab({ filters }: { filters: DashboardFilters }) {
  const sensitivity = useSensitivity();

  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [dirty, setDirty] = useState(false);
  const [nRandom, setNRandom] = useState(200);
  const [seed, setSeed] = useState(42);
  const [topN, setTopN] = useState(10);
  const [includePresets, setIncludePresets] = useState(true);

  const body = useMemo(
    () => ({
      weights,
      period_code: filters.period,
      benchmark_strategy: filters.benchmark,
      province: filters.province,
      district: filters.district,
      crop: filters.crop,
      n_random: nRandom,
      seed,
      top_n: topN,
      include_presets: includePresets,
    }),
    [weights, filters, nRandom, seed, topN, includePresets],
  );

  const run = () => {
    sensitivity.mutate(body);
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

  const result: SensitivityResponse | undefined = sensitivity.data;

  const columns: Column<SensitivityRow>[] = [
    {
      id: "rank",
      header: "#",
      width: 48,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => row.baseline_rank,
      cell: (row) => <span className="text-slate-400">{row.baseline_rank}</span>,
    },
    {
      id: "candidate",
      header: "Candidate",
      width: 170,
      sticky: true,
      sortable: true,
      sortValue: (row) => `${row.district} ${row.crop ?? ""}`,
      cell: (row) => (
        <span className="font-medium text-slate-700">
          {row.district}
          {row.crop ? <span className="text-slate-400"> · {row.crop}</span> : null}
        </span>
      ),
    },
    {
      id: "share",
      header: "Shortlist share",
      unit: "% of tested weightings",
      width: 130,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => row.top_n_share_pct,
      cell: (row) => (
        <span className="font-semibold tabular-nums text-forest-deep">
          {fmtPct(row.top_n_share_pct, 1)}
        </span>
      ),
    },
    {
      id: "band",
      header: "Dominant band",
      unit: "stability",
      width: 150,
      sortable: true,
      sortValue: (row) => row.band_stability_pct,
      cell: (row) => (
        <span className="text-xs text-slate-600">
          {row.dominant_band}{" "}
          <span className="tabular-nums text-slate-400">
            ({fmtPct(row.band_stability_pct, 0)})
          </span>
        </span>
      ),
    },
    {
      id: "range",
      header: "Rank range",
      unit: "best → worst",
      width: 130,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => row.worst_rank,
      cell: (row) => (
        <span className="tabular-nums text-slate-600">
          {row.best_rank} <span className="text-slate-300">→</span> {row.worst_rank}
          <span className="ml-1 text-[10px] text-slate-400">(median {fmtNumber(row.median_rank, 0)})</span>
        </span>
      ),
    },
    {
      id: "verdict",
      header: "Verdict",
      width: 210,
      cell: (row) => <RobustBadge row={row} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-5">
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
            isRunning={sensitivity.isPending}
            dirty={dirty}
          />

          <Card className="p-4">
            <h2 className="card-title">Sweep settings</h2>
            <p className="card-subtitle mt-1">
              How many alternative weightings to test. Every setting is fixed across the sweep, so
              only the weighting choice varies.
            </p>

            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Random weightings
                </span>
                <select
                  className="input w-full"
                  value={nRandom}
                  onChange={(event) => setNRandom(Number(event.target.value))}
                >
                  {DRAW_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 0 ? "None (presets only)" : `${option} draws`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Shortlist size (top N)
                </span>
                <input
                  className="input w-full"
                  type="number"
                  min={1}
                  max={200}
                  value={topN}
                  onChange={(event) => setTopN(Math.max(1, Number(event.target.value)))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Seed</span>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  value={seed}
                  onChange={(event) => setSeed(Math.max(0, Number(event.target.value)))}
                />
                <span className="mt-1 block text-[10px] text-slate-400">
                  The sweep is deterministic for a seed, so a result can be reproduced and reviewed.
                </span>
              </label>

              <label className="flex items-start gap-2 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includePresets}
                  onChange={(event) => setIncludePresets(event.target.checked)}
                />
                <span>
                  Always test the named planning positions as well as the random draws, so the sweep
                  cannot miss a defensible weighting.
                </span>
              </label>
            </div>

            <button
              type="button"
              className="btn btn-primary mt-3 w-full"
              onClick={run}
              disabled={sensitivity.isPending}
            >
              {sensitivity.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Test robustness
            </button>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="flex items-start gap-2 border-amber/30 bg-amber/[0.04] p-4 text-xs text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
            <span>
              <strong>A robustness share is not a probability.</strong> The sweep varies the
              weighting choice the planner controls; it does not sample from a real-world
              distribution, and it says nothing about uncertainty in the underlying agricultural
              data. “70%” means the candidate stayed in the shortlist under 70% of the{" "}
              <em>tested</em> weightings — nothing more.
            </span>
          </Card>

          {sensitivity.isError ? (
            <ErrorState message={(sensitivity.error as Error).message} onRetry={run} />
          ) : null}

          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryStat label="Weightings tested" value={fmtNumber(result.n_scenarios_tested, 0)} />
                <SummaryStat label="Candidates analysed" value={fmtNumber(result.districts_analysed, 0)} />
                <SummaryStat label="Stable candidates" value={fmtNumber(result.robust_count, 0)} />
                <SummaryStat
                  label={`Shortlist size (top ${result.top_n})`}
                  value={fmtNumber(result.top_n, 0)}
                />
              </div>

              <Card className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Sweep definition
                </p>
                <p className="mt-1.5 text-xs text-slate-600">
                  {fmtNumber(result.n_random_draws, 0)} random weighting(s) drawn on the simplex
                  {result.presets_included.length
                    ? `, plus ${result.presets_included.length} named position(s)`
                    : ", with presets excluded"}
                  . Seed <strong className="tabular-nums">{result.seed}</strong>; re-running with the
                  same seed reproduces exactly these numbers.
                </p>
                {result.presets_included.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {result.presets_included.map((key) => (
                      <li
                        key={key}
                        className="rounded-full border border-forest/10 bg-forest/[0.02] px-2.5 py-1 text-[10px] text-slate-600"
                      >
                        {result.preset_labels[key] ?? presetFallbackLabel(key)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-[11px] text-slate-500">
                  Baseline weighting:{" "}
                  {Object.entries(result.weights)
                    .map(
                      ([key, value]) =>
                        `${result.weight_labels[key] ?? key} ${fmtNumber(value, 2)}`,
                    )
                    .join(" · ")}
                </p>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader
                  title="Ranking robustness"
                  subtitle={`How often each candidate stayed in the top ${result.top_n} across the tested weightings`}
                />
                {result.rows.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      title="No candidate is published for this selection."
                      hint="There is nothing to test, so no robustness share is reported. This is an absence of candidates, not a statement that the ranking is unstable."
                    />
                  </div>
                ) : (
                  <div className="thin-scroll mt-3 max-h-[34rem] overflow-auto">
                    <ResponsiveTable
                      columns={columns}
                      rows={result.rows}
                      rowKey={(row) => row.id}
                      initialSort={{ id: "rank", direction: "asc" }}
                      caption={`Ranking robustness: shortlist share, band stability and rank range for the top ${result.top_n}`}
                    />
                  </div>
                )}
                <SourceNote>
                  Shares are computed by the Python engine over{" "}
                  {fmtNumber(result.n_scenarios_tested, 0)} tested weightings; nothing is re-ranked
                  in the browser.
                </SourceNote>
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader
                    title="What a robustness share does not tell you"
                    subtitle="The limits of a weighting sweep"
                  />
                  <ul className="ml-8 list-disc space-y-1 px-4 pb-3 pt-2 text-[11px] text-slate-500">
                    {result.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </Card>

                <Card>
                  <CardHeader
                    title="Documented proxies"
                    subtitle="Components that are proxies, not measurements"
                  />
                  <ul className="ml-8 list-disc space-y-1 px-4 pb-3 pt-2 text-[11px] text-slate-500">
                    {result.proxy_notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                  <SourceNote>
                    Source: {result.provenance.source_id ?? "not stated"} · period{" "}
                    {result.provenance.source_period ?? "—"} · benchmark{" "}
                    {result.provenance.benchmark_strategy}
                  </SourceNote>
                </Card>
              </div>

              <Card className="flex items-start gap-2 p-4 text-xs text-slate-600">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Stability is not correctness. A candidate that stays top-ranked under every tested
                  weighting is still only a candidate for field investigation, and the two documented
                  proxies (readiness and cost) are the components most likely to move a ranking if the
                  underlying practice data is replaced.
                </span>
              </Card>
            </>
          ) : null}

          {!result && !sensitivity.isPending && !sensitivity.isError ? (
            <Card className="flex items-start gap-2 p-4 text-xs text-slate-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <span>Set the weights and sweep options, then test robustness.</span>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-forest-deep">{value}</p>
    </div>
  );
}
