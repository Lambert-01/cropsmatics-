"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Database, Download, FileJson, FileText, Table2 } from "lucide-react";

import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { Card, CardBody, CardHeader, SourceNote } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { api, reportUrl } from "@/lib/api";
import { fmtNumber, periodLabel } from "@/lib/format";
import type { DashboardFilters } from "@/lib/filters";
import { useFilters } from "@/services/hooks/useFilters";
import { useDistricts, usePeriods } from "@/services/hooks/useReference";
import type { ReportCatalogEntry } from "@/types";

/**
 * Reports.
 *
 * The catalogue is read from the API rather than typed into this file, so the
 * list of exports cannot drift from what the backend can actually generate. Every
 * canonical export is period-aware and carries its unit and source per row; the
 * raw processed tables remain available for reproducibility, but they are not the
 * headline product any more.
 */

/** Human summary of the filters a report honours, e.g. "2026 Season B · Maize". */
function scopeSummary(
  entry: ReportCatalogEntry,
  filters: DashboardFilters,
  periodLabels: Map<string, string>,
): string[] {
  const parts: string[] = [];
  for (const key of entry.scope) {
    if (key === "period") {
      parts.push(
        filters.period ? periodLabels.get(filters.period) ?? filters.period : "all published periods",
      );
    } else if (key === "crop") {
      parts.push(filters.crop ?? "all crops");
    } else if (key === "province") {
      parts.push(filters.province ?? "all provinces");
    } else if (key === "district") {
      parts.push(filters.district ?? "all districts");
    } else if (key === "benchmark") {
      parts.push((filters.benchmark ?? "national_crop_median").replace(/_/g, " "));
    }
  }
  return parts;
}

function ReportCard({
  entry,
  filters,
  periodLabels,
}: {
  entry: ReportCatalogEntry;
  filters: DashboardFilters;
  periodLabels: Map<string, string>;
}) {
  const applies = entry.scope.length > 0;
  const summary = applies ? scopeSummary(entry, filters, periodLabels) : [];
  const formats = new Set(entry.formats);

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-forest-deep">{entry.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{entry.description}</p>
        </div>
      </div>

      {applies && summary.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Applies</span>
          {summary.map((part, i) => (
            <span key={`${part}-${i}`} className="inline-flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              <span className="rounded-full border border-forest/15 bg-forest/[0.04] px-2 py-0.5 font-medium text-forest">
                {part}
              </span>
            </span>
          ))}
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Scope</span> ·{" "}
          Complete dataset, not affected by the filters above
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">{entry.coverage_note}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <a
          href={reportUrl(entry.endpoint, applies ? filters : undefined, "csv")}
          className="btn btn-primary text-xs"
          download
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
        </a>
        {formats.has("json") ? (
          <a
            href={reportUrl(entry.endpoint, applies ? filters : undefined, "json")}
            className="btn text-xs"
            download
          >
            <FileJson className="h-3.5 w-3.5" aria-hidden="true" /> JSON
          </a>
        ) : null}
        <code className="ml-auto max-w-full truncate text-[10px] text-slate-400">{entry.filename}</code>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { filters } = useFilters();
  const { data: districts } = useDistricts();
  const { data: periodsData } = usePeriods();

  const catalog = useQuery({
    queryKey: ["report-catalog"],
    queryFn: api.reportCatalog,
    staleTime: 60 * 60 * 1000,
  });

  const datasets = useQuery({
    queryKey: ["datasets"],
    queryFn: api.datasets,
    staleTime: 60 * 60 * 1000,
  });

  const summary = useQuery({
    // Period is part of the key: a cached 2026B summary must never be shown
    // while the page is scoped to another period.
    queryKey: ["district-summary", filters.district, filters.period ?? filters.year, filters.season],
    queryFn: () => api.districtSummary(filters.district as string, filters),
    enabled: Boolean(filters.district),
  });

  const periodLabels = new Map<string, string>(
    (periodsData?.periods ?? []).map((p) => [p.period_code, p.label]),
  );

  const groups = (catalog.data?.reports ?? []).reduce<Record<string, ReportCatalogEntry[]>>(
    (acc, entry) => {
      (acc[entry.group] ??= []).push(entry);
      return acc;
    },
    {},
  );

  const district = filters.district;
  const districtEntry = (districts ?? []).find((d) => d.district === district);

  return (
    <div className="space-y-5">
      <PageHeading
        title="Reports"
        subtitle="Canonical, period-aware exports. Every file is generated by Python from the same tables the interface reads, so a download always matches what is on screen."
      />

      <AnalyticsFilterBar coverageLabel="EXPORTS FOLLOW THESE FILTERS" />

      {catalog.isLoading ? (
        <TableSkeleton rows={6} />
      ) : catalog.error ? (
        <ErrorState message={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />
      ) : (
        Object.entries(groups).map(([group, entries]) => (
          <section key={group} className="space-y-3" aria-label={`${group} reports`}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
              {group}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => (
                <ReportCard
                  key={entry.key}
                  entry={entry}
                  filters={filters}
                  periodLabels={periodLabels}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* District scorecard: a live preview of the exact rows the export contains. */}
      <Card>
        <CardHeader
          title="District scorecard"
          subtitle={
            district
              ? `${district}${districtEntry?.province ? ` · ${districtEntry.province}` : ""} · ${
                  filters.period ? periodLabels.get(filters.period) ?? filters.period : "all published periods"
                }`
              : "Per-crop measures, benchmark and yield gap for one district"
          }
          action={
            district ? (
              <div className="flex items-center gap-2">
                <a
                  href={reportUrl("/reports/district-scorecard.csv", filters, "csv")}
                  className="btn btn-primary text-xs"
                  download
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Scorecard CSV
                </a>
                <a
                  href={reportUrl("/reports/district-scorecard.csv", filters, "json")}
                  className="btn text-xs"
                  download
                >
                  <FileJson className="h-3.5 w-3.5" aria-hidden="true" /> JSON
                </a>
              </div>
            ) : null
          }
        />

        <CardBody>
          {!district ? (
            <EmptyState
              title="Choose a district in the filters above."
              hint="The scorecard previews the same rows the export contains. Every export works with or without a selection."
            />
          ) : summary.isLoading ? (
            <TableSkeleton rows={5} />
          ) : summary.error ? (
            <ErrorState
              message={(summary.error as Error).message}
              onRetry={() => summary.refetch()}
            />
          ) : summary.data && summary.data.crops.length > 0 ? (
            <div className="thin-scroll max-h-[26rem] overflow-auto">
              <table className="table-base">
                <caption className="sr-only">
                  Published crop measures for {district} in the selected period
                </caption>
                <thead>
                  <tr>
                    <th>Crop</th>
                    <th className="text-right">Median yield (kg/ha)</th>
                    <th className="text-right">Production (mt)</th>
                    <th className="text-right">Harvested area (ha)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.crops.map((c, i) => (
                    <tr key={`${String(c.crop)}-${i}`}>
                      <td className="font-medium text-slate-700">{String(c.crop)}</td>
                      <td className="text-right tabular-nums">
                        {fmtNumber(c.crop_yield_median_kg_ha as number, 0)}
                      </td>
                      <td className="text-right tabular-nums">
                        {fmtNumber(c.production_mt as number, 0)}
                      </td>
                      <td className="text-right tabular-nums">
                        {fmtNumber(c.harvested_area_ha as number, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={`No published district yields for ${district} in this selection.`}
              hint="Try another period, or clear the selection to span every published period."
            />
          )}
        </CardBody>

        {/*
          The source and period are read from the response, so the note can never
          name a release the rows did not come from.
        */}
        <SourceNote>
          <FileText className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Source: {summary.data?.provenance.source_id ?? "—"} · Period:{" "}
          {periodLabel(summary.data?.provenance.source_period ?? null)} ·{" "}
          {summary.data?.provenance.method ?? "aggregated from the canonical district × crop panel"}.
          A yield is only comparable within one crop. Gap columns use the{" "}
          {(filters.benchmark ?? "national_crop_median").replace(/_/g, " ")} benchmark.
        </SourceNote>
      </Card>

      {/* Reproducibility: the raw processed tables stay reachable, but they are
          explicitly not the analytical report set. */}
      <details className="card p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-forest-deep">
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          <Table2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Raw processed tables (reproducibility)
          <span className="ml-auto text-[11px] font-normal text-slate-500">
            {datasets.data?.datasets.length ?? 0} tables
          </span>
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Exactly what the pipeline produced, without the canonical reshaping. Useful for debugging
          and for reproducing a figure; the reports above are the supported analytical exports and
          include the unit, source and quality flag per row.
        </p>
        {datasets.isLoading ? (
          <TableSkeleton rows={4} />
        ) : datasets.error ? (
          <div className="mt-3">
            <ErrorState
              message={(datasets.error as Error).message}
              onRetry={() => datasets.refetch()}
            />
          </div>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(datasets.data?.datasets ?? []).map((d) => (
              <li key={d.key}>
                <a
                  href={reportUrl(`/dataset/${d.key}.csv`)}
                  className="flex items-center gap-2 rounded-lg border border-forest/10 px-3 py-2 text-xs transition hover:border-primary/30"
                  download
                >
                  <Download className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-forest">{d.label}</span>
                    <span className="block truncate text-[10px] text-slate-400">{d.key}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </details>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <Database className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            For the authoritative statement of what this build contains — coverage per dataset and
            period, and the provenance behind every figure — see
          </span>
          <a
            href="/transparency"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Data &amp; Models
          </a>
          <a href="/data-explorer" className="font-medium text-primary underline-offset-2 hover:underline">
            Data Explorer
          </a>
        </CardBody>
      </Card>
    </div>
  );
}
