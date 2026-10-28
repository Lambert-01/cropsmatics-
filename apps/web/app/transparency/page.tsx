"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Database, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import { useMemo } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { api } from "@/lib/api";
import { coverageLimitations, type CoverageDetailRow } from "@/lib/coverage";
import { benchmarkLabel, periodLabel } from "@/lib/format";
import {
  useCoverage,
  useDataVersion,
  useDatasets,
  useModels,
  useSources,
} from "@/services/hooks/useReference";

const HIDDEN_FROM_DATA_MODELS = new Set(["market_price_observation"]);

const AI_USAGE = [
  "Python computes data-derived values; the assistant retrieves validated API results.",
  "Answers include the source, period, unit and limitations when evidence is available.",
  "No yield, production, price, capacity, loss or model-accuracy value is invented.",
];

const STATIC_LIMITATIONS = [
  "Results describe associations and priorities for investigation, not causal effects.",
  "Storage capacity is not verified in any public facility source used here.",
  "Benchmark choice changes the productivity gap and is reported with each result.",
];

function DatasetLinks({ datasets }: { datasets: { key: string; label: string }[] }) {
  if (!datasets.length) {
    return <p className="text-xs text-slate-500">No served datasets are available in this build.</p>;
  }

  return (
    <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {datasets.map((dataset) => (
        <li key={dataset.key}>
          <Link
            href={`/data-explorer?dataset=${encodeURIComponent(dataset.key)}`}
            className="group flex items-center justify-between gap-2 text-sm text-forest-deep hover:text-primary"
          >
            <span className="truncate">{dataset.label}</span>
            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function TransparencyPage() {
  const coverage = useCoverage();
  const sources = useSources();
  const datasets = useDatasets();
  const models = useModels();
  const dataVersion = useDataVersion();
  const algorithms = useQuery({ queryKey: ["algorithms"], queryFn: api.algorithms });

  const limitations = useMemo(
    () => [
      ...coverageLimitations((coverage.data?.details ?? []) as CoverageDetailRow[]),
      ...STATIC_LIMITATIONS,
    ],
    [coverage.data],
  );

  const servedDatasets = useMemo(
    () =>
      (datasets.data?.datasets ?? []).filter((dataset) => !HIDDEN_FROM_DATA_MODELS.has(dataset.key)),
    [datasets.data],
  );
  const currentDatasets = servedDatasets.filter((dataset) => dataset.group === "current");
  const supportingDatasets = servedDatasets.filter((dataset) => dataset.group !== "current");
  const periodCount = new Set(
    (coverage.data?.details ?? []).map((detail) => String(detail.period)),
  ).size;

  return (
    <div className="transparency-workspace space-y-5">
      <PageHeading
        title="Data & Models"
        subtitle="The evidence behind Cropmatics, in a short path from source to decision."
        action={
          <Link href="/data-explorer" className="btn text-xs">
            <Database className="h-3.5 w-3.5" aria-hidden="true" /> Explore tables
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Evidence summary">
        <div className="transparency-stat">
          <p className="transparency-stat-label">Official sources</p>
          <p className="transparency-stat-value">{sources.data?.sources.length ?? "—"}</p>
          <p className="transparency-stat-note">Registered provenance records</p>
        </div>
        <div className="transparency-stat">
          <p className="transparency-stat-label">Published periods</p>
          <p className="transparency-stat-value">{periodCount || "—"}</p>
          <p className="transparency-stat-note">Only periods present in processed tables</p>
        </div>
        <div className="transparency-stat">
          <p className="transparency-stat-label">Served datasets</p>
          <p className="transparency-stat-value">{servedDatasets.length || "—"}</p>
          <p className="transparency-stat-note">Open the full table in Data Explorer</p>
        </div>
        <div className="transparency-stat">
          <p className="transparency-stat-label">Pipeline</p>
          <p className="transparency-stat-value capitalize">
            {dataVersion.data?.validation?.status ?? "—"}
          </p>
          <p className="transparency-stat-note">
            {dataVersion.data ? `${dataVersion.data.validation?.errors ?? 0} errors` : "Build status"}
          </p>
        </div>
      </section>

      <Card>
        <CardHeader
          title="How a number reaches the screen"
          subtitle="Every analytical value follows the same traceable path."
        />
        <div className="grid gap-3 px-4 pb-4 pt-3 md:grid-cols-3">
          <div className="transparency-step">
            <Database className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-forest-deep">1. Official inputs</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                NISR and documented public context are retained with their release and table.
              </p>
            </div>
          </div>
          <div className="transparency-step">
            <Workflow className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-forest-deep">2. Python processing</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Validation, aggregation, benchmarks and coverage rules run in the data services.
              </p>
            </div>
          </div>
          <div className="transparency-step">
            <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-forest-deep">3. Served evidence</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                FastAPI returns units, period, source and limitations for the web and mobile apps.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Datasets used by Cropmatics"
          subtitle="Only served evidence is listed here; detailed rows and original SAS sheets remain in Data Explorer."
          action={
            <Link href="/data-explorer" className="text-xs font-semibold text-primary hover:underline">
              Open explorer
            </Link>
          }
        />
        <div className="px-4 pb-4 pt-3">
          {datasets.isLoading ? (
            <TableSkeleton rows={3} />
          ) : datasets.error ? (
            <ErrorState message={(datasets.error as Error).message} onRetry={() => datasets.refetch()} />
          ) : (
            <>
              <div className="space-y-2">
                <p className="transparency-kicker">Current multi-period evidence</p>
                <DatasetLinks datasets={currentDatasets} />
              </div>
              <details className="transparency-details mt-4">
                <summary>Supporting, archive and reference tables ({supportingDatasets.length})</summary>
                <div className="mt-3 border-t border-forest/10 pt-3">
                  <DatasetLinks datasets={supportingDatasets} />
                </div>
              </details>
              <p className="mt-4 border-t border-forest/10 pt-3 text-xs leading-relaxed text-slate-500">
                Market prices are intentionally not shown as a served dataset because no attributable
                market-price source is registered. No mock or fabricated application dataset is used.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Source registry"
          subtitle="Publisher, coverage and intended use for every registered source."
        />
        <details className="transparency-details mx-4 mb-4 mt-3">
          <summary>Show full source registry</summary>
          {sources.isLoading ? (
            <div className="pt-3">
              <TableSkeleton rows={5} />
            </div>
          ) : sources.error ? (
            <div className="pt-3">
              <ErrorState message={(sources.error as Error).message} onRetry={() => sources.refetch()} />
            </div>
          ) : (sources.data?.sources ?? []).length === 0 ? (
            <div className="pt-3">
              <EmptyState title="No registered sources." hint="Run the data pipeline to build the registry." />
            </div>
          ) : (
            <div className="thin-scroll mt-3 max-h-[22rem] overflow-auto" tabIndex={0} role="region" aria-label="Registered data sources">
              <table className="table-base">
                <thead>
                  <tr><th>Dataset</th><th>Owner</th><th>Type</th><th>Coverage</th><th>Use</th><th>Access</th></tr>
                </thead>
                <tbody>
                  {(sources.data?.sources ?? []).map((source) => (
                    <tr key={source.dataset}>
                      <td className="font-medium text-slate-700">{source.dataset}</td>
                      <td>{source.owner ?? "NISR / MINAGRI"}</td>
                      <td>{source.type ?? "official aggregate"}</td>
                      <td>{source.coverage ?? "—"}</td>
                      <td className="max-w-[22rem] text-xs text-slate-600">{source.use ?? "—"}</td>
                      <td className="text-xs">
                        {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="text-primary">Open</a> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Coverage and quality"
          subtitle="Coverage is domain-specific; missing periods are shown as unavailable, not filled."
        />
        <div className="px-4 pb-4 pt-3">
          {coverage.isLoading || dataVersion.isLoading ? (
            <TableSkeleton rows={4} />
          ) : coverage.error ? (
            <ErrorState message={(coverage.error as Error).message} onRetry={() => coverage.refetch()} />
          ) : dataVersion.error ? (
            <ErrorState message={(dataVersion.error as Error).message} onRetry={() => dataVersion.refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="status-chip status-chip-success">pipeline {dataVersion.data?.validation?.status ?? "unknown"}</span>
                <span className="chip">{dataVersion.data?.dataset_count ?? "—"} pipeline outputs</span>
                <span className="chip">{dataVersion.data?.validation?.warnings ?? 0} warnings</span>
                <span className="chip">{dataVersion.data?.validation?.errors ?? 0} errors</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                Official raw values are preserved. Validation warnings remain visible in the build
                manifest and are not silently corrected in the application.
              </p>
              <details className="transparency-details mt-4">
                <summary>Show coverage matrix and quality findings</summary>
                <div className="mt-3 space-y-4 border-t border-forest/10 pt-3">
                  <ul className="space-y-1 text-xs text-slate-600">
                    {(coverage.data?.notes ?? []).map((note) => <li key={note}>• {note}</li>)}
                  </ul>
                  <div className="thin-scroll max-h-[26rem] overflow-auto" tabIndex={0} role="region" aria-label="Data coverage details">
                    <table className="table-base">
                      <thead><tr><th>Dataset</th><th>Period</th><th>Level</th><th className="text-right">Districts</th><th className="text-right">Crops</th></tr></thead>
                      <tbody>
                        {(coverage.data?.details ?? []).map((detail, index) => (
                          <tr key={index}>
                            <td className="text-slate-700">{String(detail.dataset)}</td>
                            <td>{periodLabel(String(detail.period))}</td>
                            <td><span className={`status-chip ${detail.coverage_level === "district" ? "status-chip-success" : "status-chip-muted"}`}>{String(detail.coverage_level)}</span></td>
                            <td className="text-right">{String(detail.n_districts)}</td>
                            <td className="text-right">{String(detail.n_crops)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(dataVersion.data?.validation?.issues ?? []).length > 0 ? (
                    <div className="thin-scroll max-h-[20rem] overflow-auto" tabIndex={0} role="region" aria-label="Data quality issues">
                      <table className="table-base">
                        <thead><tr><th>Level</th><th>Dataset</th><th>Finding</th><th className="text-right">Count</th></tr></thead>
                        <tbody>
                          {(dataVersion.data?.validation?.issues ?? []).map((issue, index) => (
                            <tr key={index}>
                              <td><span className={`status-chip ${issue.level === "error" ? "status-chip-danger" : issue.level === "warn" ? "status-chip-warning" : "status-chip-muted"}`}>{issue.level}</span></td>
                              <td className="text-xs text-slate-600">{issue.dataset}</td>
                              <td className="text-xs text-slate-700">{issue.message}</td>
                              <td className="text-right tabular-nums">{issue.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </details>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Methods and planning rules" subtitle="The short version of what the analytics mean." />
          <div className="px-4 pb-4 pt-3 text-sm text-slate-700">
            {algorithms.isLoading ? <TableSkeleton rows={3} /> : algorithms.error ? (
              <ErrorState message={(algorithms.error as Error).message} onRetry={() => algorithms.refetch()} />
            ) : algorithms.data ? (
              <>
                <p className="transparency-kicker">Benchmarks</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {algorithms.data.benchmark_strategies.map((benchmark) => (
                    <li key={benchmark.id} className="flex justify-between gap-3"><span>{benchmarkLabel(benchmark.id)}</span><code className="text-[10px] text-slate-400">{benchmark.id}</code></li>
                  ))}
                </ul>
                <p className="transparency-kicker mt-4">Default priority weights</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {Object.entries(algorithms.data.priority_weights).map(([key, value]) => <li key={key} className="flex justify-between"><span>{key}</span><span className="tabular-nums text-slate-500">{value}</span></li>)}
                </ul>
                <p className="mt-3 text-[11px] text-slate-500">High-gap threshold: {algorithms.data.high_gap_threshold_pct}%.</p>
              </>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Documented proxies" subtitle="Used only where verified measurements are unavailable." />
          <ul className="ml-4 list-disc space-y-2 px-4 pb-4 pt-3 text-xs leading-relaxed text-slate-600">
            {(algorithms.data?.proxies ?? []).map((proxy) => <li key={proxy}>{proxy}</li>)}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Model status" subtitle="Metrics appear only when a real validated artifact is registered." />
        <div className="px-4 pb-4 pt-3">
          {models.isLoading ? <TableSkeleton rows={2} /> : models.error ? (
            <ErrorState message={(models.error as Error).message} onRetry={() => models.refetch()} />
          ) : (models.data?.models ?? []).length === 0 ? (
            <EmptyState title="No validated model artifact is present." hint="Forecasts remain unavailable until a model passes chronological validation." />
          ) : (
            <ul className="space-y-2 text-sm">
              {(models.data?.models ?? []).map((model) => (
                <li key={model.name} className="transparency-model-row">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="font-medium text-forest">{model.name}</span>
                    <span className="ml-auto text-xs text-slate-500">{model.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {model.status === "available" ? `MAE ${model.mae ?? "—"} · RMSE ${model.rmse ?? "—"} · R² ${model.r2 ?? "—"} · ${model.validation_method ?? ""}` : model.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Limitations" subtitle="Important boundaries for interpretation." />
          <ul className="ml-4 list-disc space-y-2 px-4 pb-4 pt-3 text-xs leading-relaxed text-slate-600">
            {limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="AI use" subtitle="Assistive, grounded and separate from the official data pipeline." />
          <ul className="ml-4 list-disc space-y-2 px-4 pb-4 pt-3 text-xs leading-relaxed text-slate-600">
            {AI_USAGE.map((statement) => <li key={statement}>{statement}</li>)}
          </ul>
          <p className="flex items-start gap-2 border-t border-forest/5 px-4 py-3 text-[11px] text-slate-500">
            <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Official statistics and voluntary mobile records remain separate.
          </p>
        </Card>
      </div>
    </div>
  );
}
