"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, ShieldCheck } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { api } from "@/lib/api";
import { benchmarkLabel, periodLabel } from "@/lib/format";
import { useCoverage, useDataVersion, useModels, useSources } from "@/services/hooks/useReference";

const AI_USAGE = [
  "Assistive tooling was used for code scaffolding and documentation; all data-derived values come from the Python pipeline.",
  "The AI Assistant answers only by retrieving API results and cites the source id and period it used.",
  "The assistant is forbidden from inventing yield, production, price, capacity, loss or accuracy values.",
];

const LIMITATIONS = [
  "District-level data exist only for NISR 2025 Season B; other periods are national context.",
  "All results describe associations and priorities for investigation, not causal effects.",
  "Storage capacity is not verified in any public facility source used here.",
  "Benchmark choice materially changes the productivity gap; the strategy is always reported.",
];

export default function TransparencyPage() {
  const coverage = useCoverage();
  const sources = useSources();
  const models = useModels();
  const dataVersion = useDataVersion();
  const algorithms = useQuery({ queryKey: ["algorithms"], queryFn: api.algorithms });

  return (
    <div className="space-y-5">
      <PageHeading
        title="Data & Models"
        subtitle="What Cropmatics uses, how it is computed, and what it does not claim."
      />

      {/* Data sources */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Data sources"
          subtitle="Official statistics are kept separate from voluntary operational app data"
        />
        {sources.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={5} />
          </div>
        ) : (sources.data?.sources ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="No registered sources." hint="Run the data pipeline to build the registry." />
          </div>
        ) : (
          <div className="thin-scroll mt-3 max-h-[22rem] overflow-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Coverage</th>
                  <th>Use</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {(sources.data?.sources ?? []).map((s) => (
                  <tr key={s.dataset}>
                    <td className="font-medium text-slate-700">{s.dataset}</td>
                    <td>{s.owner ?? "NISR / MINAGRI"}</td>
                    <td>{s.type ?? "official aggregate"}</td>
                    <td>{s.coverage ?? "—"}</td>
                    <td className="max-w-[22rem] text-xs text-slate-600">{s.use ?? "—"}</td>
                    <td className="text-xs">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-primary">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Coverage */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Data coverage"
          subtitle="Which dataset covers which period, and at which geographic level"
        />
        {coverage.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={5} />
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3">
            <ul className="mb-3 space-y-1 text-xs text-slate-600">
              {(coverage.data?.notes ?? []).map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
            <div className="thin-scroll max-h-[26rem] overflow-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Period</th>
                    <th>Level</th>
                    <th className="text-right">Districts</th>
                    <th className="text-right">Crops</th>
                  </tr>
                </thead>
                <tbody>
                  {(coverage.data?.details ?? []).map((d, i) => (
                    <tr key={i}>
                      <td className="text-slate-700">{String(d.dataset)}</td>
                      <td>{periodLabel(String(d.period))}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            d.coverage_level === "district"
                              ? "bg-success/10 text-success"
                              : "bg-slate-500/10 text-slate-600"
                          }`}
                        >
                          {String(d.coverage_level)}
                        </span>
                      </td>
                      <td className="text-right">{String(d.n_districts)}</td>
                      <td className="text-right">{String(d.n_crops)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* Data quality + pipeline build identity */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Data pipeline and quality"
          subtitle="The exact build serving this API, and every warning it raised"
        />
        <div className="px-4 pb-4 pt-3">
          {dataVersion.isLoading ? (
            <TableSkeleton rows={3} />
          ) : !dataVersion.data?.available ? (
            <EmptyState
              title="No data manifest is present."
              hint="Run the data pipeline (make data) to generate the manifest and validation report."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    dataVersion.data.validation?.status === "passed"
                      ? "bg-success/10 text-success"
                      : "bg-danger/10 text-danger"
                  }`}
                >
                  pipeline {dataVersion.data.validation?.status ?? "unknown"}
                </span>
                <span className="chip">pipeline v{dataVersion.data.pipeline_version ?? "—"}</span>
                <span className="chip">
                  build {(dataVersion.data.git_sha ?? "unknown").slice(0, 8)}
                </span>
                <span className="chip">
                  {dataVersion.data.build_timestamp
                    ? new Date(dataVersion.data.build_timestamp).toLocaleString()
                    : "unknown build time"}
                </span>
                <span className="chip">
                  errors <strong>{dataVersion.data.validation?.errors ?? 0}</strong>
                </span>
                <span className="chip">
                  warnings <strong>{dataVersion.data.validation?.warnings ?? 0}</strong>
                </span>
                <span className="chip">{dataVersion.data.dataset_count} datasets built</span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                Warnings are published, not suppressed. Two of them are expected and are never
                &quot;cleaned&quot; away: 49 district/crop rows report no cultivated area because the crop
                was not grown in that district, and 62 rows report a harvested area slightly above
                the cultivated area. Official raw values are left exactly as published; the
                discrepancies are categorised into rounding tolerance, review and severe in
                <code className="ml-1">data/interim/area_consistency_report.csv</code>.
              </p>

              {(dataVersion.data.validation?.issues ?? []).length > 0 ? (
                <div className="thin-scroll mt-3 max-h-[20rem] overflow-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th>Dataset</th>
                        <th>Finding</th>
                        <th className="text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dataVersion.data.validation?.issues ?? []).map((i, idx) => (
                        <tr key={idx}>
                          <td>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                i.level === "error"
                                  ? "bg-danger/10 text-danger"
                                  : i.level === "warn"
                                    ? "bg-amber/10 text-amber"
                                    : "bg-slate-500/10 text-slate-600"
                              }`}
                            >
                              {i.level}
                            </span>
                          </td>
                          <td className="text-xs text-slate-600">{i.dataset}</td>
                          <td className="text-xs text-slate-700">{i.message}</td>
                          <td className="text-right tabular-nums">{i.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Card>

      {/* Algorithms + benchmark strategies */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Algorithms" subtitle="Benchmark strategies and priority weighting" />
          <div className="px-4 pb-4 pt-3 text-sm text-slate-700">
            {algorithms.isLoading ? (
              <TableSkeleton rows={3} />
            ) : algorithms.data ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Benchmark strategies
                </p>
                <ul className="mt-1 space-y-1 text-xs">
                  {algorithms.data.benchmark_strategies.map((b) => (
                    <li key={b.id} className="flex justify-between gap-3">
                      <span>{benchmarkLabel(b.id)}</span>
                      <code className="text-[10px] text-slate-400">{b.id}</code>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Priority weights (default)
                </p>
                <ul className="mt-1 space-y-1 text-xs">
                  {Object.entries(algorithms.data.priority_weights).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="tabular-nums text-slate-500">{v}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-slate-500">
                  High-gap threshold: {algorithms.data.high_gap_threshold_pct}%.
                </p>
              </>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Documented proxies" subtitle="Where official data are unavailable" />
          <ul className="px-4 pb-4 pt-3 ml-4 list-disc space-y-1 text-xs text-slate-600">
            {(algorithms.data?.proxies ?? []).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Models */}
      <Card>
        <CardHeader title="Model versions" subtitle="Metrics are reported only for real artifacts" />
        <div className="px-4 pb-4 pt-3">
          {models.isLoading ? (
            <TableSkeleton rows={2} />
          ) : (models.data?.models ?? []).length === 0 ? (
            <EmptyState title="No model artifact is present." hint="Run `make ml` to train the baseline." />
          ) : (
            <ul className="space-y-2 text-sm">
              {(models.data?.models ?? []).map((m) => (
                <li key={m.name} className="rounded-lg border border-forest/10 p-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="font-medium text-forest">{m.name}</span>
                    <span className="ml-auto text-xs text-slate-500">{m.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {m.status === "available"
                      ? `MAE ${m.mae ?? "—"} · RMSE ${m.rmse ?? "—"} · R² ${m.r2 ?? "—"} · ${m.validation_method ?? ""}`
                      : m.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Limitations + AI usage */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Limitations" subtitle="Stated plainly, not buried" />
          <ul className="px-4 pb-4 pt-3 ml-4 list-disc space-y-1 text-sm text-slate-700">
            {LIMITATIONS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="AI usage disclosure" subtitle="How AI is used, and how it is bounded" />
          <ul className="px-4 pb-4 pt-3 ml-4 list-disc space-y-1 text-sm text-slate-700">
            {AI_USAGE.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="flex items-start gap-2 border-t border-forest/5 px-4 py-3 text-[11px] text-slate-500">
            <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Official NISR/MINAGRI statistics and voluntary app data are stored and reported
            separately, and never merged at respondent level.
          </p>
        </Card>
      </div>
    </div>
  );
}
