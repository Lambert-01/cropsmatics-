"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { filtersToQuery, type DashboardFilters } from "@/lib/filters";
import { fmtNumber } from "@/lib/format";
import type { FieldObservationsResponse } from "@/types";

/**
 * A compact entry point for the privacy-safe AHS sample.
 *
 * The dashboard owns the district comparison chart. This card gives every
 * analytical workspace the same filtered sample totals and a direct route to
 * that chart, without copying a row-level table or calculating totals in React.
 */
export function FieldEvidenceSummary({
  data,
  filters,
  isLoading,
  isError,
  onRetry,
}: {
  data?: FieldObservationsResponse;
  filters: DashboardFilters;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const href = `/dashboard${filtersToQuery(filters) ? `?${filtersToQuery(filters)}` : ""}`;
  const periods = data?.available_periods?.join(", ") || "not published";

  if (isError && !data) {
    return (
      <Card>
        <CardHeader title="Field evidence" subtitle="Privacy-safe AHS plot-crop sample" />
        <div className="p-4">
          <ErrorState message="Field evidence could not be loaded." onRetry={onRetry} />
        </div>
      </Card>
    );
  }
  if (isLoading && !data) return <TableSkeleton rows={2} />;

  return (
    <Card>
      <CardHeader
        title="Field evidence"
        subtitle="AHS plot-crop sample aggregated to the current filters"
        action={
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Open chart <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />
      <div className="px-4 pb-4 pt-3">
        {!data?.available || data.rows.length === 0 ? (
          <EmptyState
            title="No field sample matches this selection"
            hint={`${data?.message ?? "The selected scope has no approved AHS sample."} Sample coverage: ${periods}.`}
          />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <SummaryStat label="Plot-crop records" value={fmtNumber(data.n_plot_records)} />
              <SummaryStat label="Area represented" value={`${fmtNumber(data.area_ha_total, 1)} ha`} />
              <SummaryStat label="Production represented" value={`${fmtNumber(data.production_kg_total, 0)} kg`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-300">
              <span>Sample periods: {periods}</span>
              <span>{data.count} district/crop rows in this scope</span>
              {data.geometry_available ? (
                <span>{fmtNumber(data.n_records_with_geometry)} approved geometries</span>
              ) : (
                <span>Exact field boundaries not supplied</span>
              )}
            </div>
          </>
        )}
        <SourceNote>
          {data?.provenance
            ? `Source: ${data.provenance.source_id ?? "No sample loaded"} · ${data.provenance.method}`
            : "Source: NISR/AHS aggregate"}
        </SourceNote>
      </div>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-forest/10 bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-300">
        {label}
      </p>
      <p className="mt-1 font-semibold text-forest dark:text-white">{value}</p>
    </div>
  );
}
