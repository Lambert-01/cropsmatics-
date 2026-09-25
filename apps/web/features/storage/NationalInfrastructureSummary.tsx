"use client";

import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DataBadge } from "@/components/ui/DataBadge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { NationalContextBadge } from "@/components/ui/NationalContextBadge";
import { ChartSkeleton, EmptyState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { fmtNumber } from "@/lib/format";
import type { StorageInfrastructureResponse } from "@/types";

/**
 * National MINAGRI post-harvest infrastructure totals.
 *
 * This block is always national. It is never filtered by district and never
 * placed next to the facility table without the "national totals" label, because
 * a national capacity attached to one market would be a false claim.
 */
export function NationalInfrastructureSummary({
  data,
  isLoading,
}: {
  data?: StorageInfrastructureResponse;
  isLoading?: boolean;
}) {
  if (isLoading) return <ChartSkeleton height={280} />;

  const items = data?.items ?? [];
  const totals = data?.totals ?? null;

  if (!data || items.length === 0) {
    return (
      <Card>
        <CardHeader
          title="National post-harvest infrastructure"
          subtitle="Published MINAGRI national totals by infrastructure type"
          action={
            <>
              <NationalContextBadge note="district filter not applicable" />
              <DataBadge kind="official_national" />
            </>
          }
        />
        <div className="p-4">
          <EmptyState
            title="The national infrastructure table is not built yet."
            hint="Run the data pipeline (make data) to ingest the MINAGRI add-on."
          />
        </div>
      </Card>
    );
  }

  const chartData = items
    .filter((i) => (i.total_capacity_mt ?? 0) > 0)
    .map((i) => ({
      name: i.infrastructure_type ?? "—",
      existing: i.existing_capacity_mt ?? 0,
      added: i.new_capacity_mt ?? 0,
    }))
    .sort((a, b) => b.existing + b.added - (a.existing + a.added));

  return (
    <Card>
      <CardHeader
        title="National post-harvest infrastructure"
        subtitle={
          totals?.period
            ? `MINAGRI Annual Report ${totals.period} — national totals across Rwanda`
            : "MINAGRI national totals across Rwanda"
        }
        action={
          <>
            <NationalContextBadge note="district filter not applicable" />
            <DataBadge kind="official_national" />
          </>
        }
      />

      <div className="flex items-start gap-2 border-t border-forest/10 bg-primary/[0.04] px-4 py-2 text-[11px] text-slate-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <strong className="text-forest">National totals — not facility-level capacity.</strong>{" "}
          These figures already count every facility of that type in the country, so they are never
          joined to a district or shown on an individual storage marker.
        </span>
      </div>

      {totals ? (
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-forest/10 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Total capacity
            </p>
            <p className="metric mt-1">{fmtNumber(totals.total_capacity_mt, 0)}</p>
            <p className="text-[11px] text-slate-500">metric tonnes (existing + new)</p>
          </div>
          <div className="rounded-xl border border-forest/10 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Total facilities
            </p>
            <p className="metric mt-1">{fmtNumber(totals.total_number, 0)}</p>
            <p className="text-[11px] text-slate-500">units across all listed types</p>
          </div>
          <div className="rounded-xl border border-forest/10 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              New capacity added
            </p>
            <p className="metric mt-1">{fmtNumber(totals.new_capacity_mt, 0)}</p>
            <p className="text-[11px] text-slate-500">metric tonnes in this period</p>
          </div>
          <div className="rounded-xl border border-forest/10 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              New units added
            </p>
            <p className="metric mt-1">{fmtNumber(totals.new_number, 0)}</p>
            <p className="text-[11px] text-slate-500">facilities built in this period</p>
          </div>
        </div>
      ) : null}

      {chartData.length > 0 ? (
        <>
          <div className="px-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Capacity by infrastructure type (metric tonnes)
            </h3>
          </div>
          <div style={{ height: Math.max(240, chartData.length * 44) }} className="px-2 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 4, right: 28, bottom: 4, left: 12 }}
              >
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...AXIS_PROPS} tickFormatter={(v) => fmtNumber(Number(v), 0)} />
                <YAxis type="category" dataKey="name" width={150} {...AXIS_PROPS} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value, name) => [
                    `${fmtNumber(Number(value), 0)} mt`,
                    name === "added" ? "new in period" : "existing",
                  ]}
                />
                <Bar dataKey="existing" stackId="cap" fill={CHART.primary} />
                <Bar dataKey="added" stackId="cap" radius={[0, 4, 4, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={d.added > 0 ? CHART.amber : CHART.primary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}

      <div className="thin-scroll mt-2 max-h-[22rem] overflow-auto border-t border-forest/10">
        <table className="table-base">
          <thead>
            <tr>
              <th>Infrastructure type</th>
              <th className="text-right">Existing</th>
              <th className="text-right">Existing capacity (mt)</th>
              <th className="text-right">New</th>
              <th className="text-right">New capacity (mt)</th>
              <th className="text-right">Total</th>
              <th className="text-right">Total capacity (mt)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.infrastructure_type}>
                <td className="font-medium text-slate-700">{i.infrastructure_type}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.existing_number, 0)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.existing_capacity_mt, 0)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.new_number, 0)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.new_capacity_mt, 0)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.total_number, 0)}</td>
                <td className="text-right tabular-nums">{fmtNumber(i.total_capacity_mt, 0)}</td>
                <td className="text-xs">
                  {i.source_url ? (
                    <a href={i.source_url} target="_blank" rel="noreferrer" className="text-primary">
                      MINAGRI
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

      <SourceNote>
        Source: MINAGRI Annual Report {totals?.period ?? "2024/2025"}. Published per-type totals are
        passed through unchanged; the summary row is an explicit derived sum of those published rows.
      </SourceNote>
    </Card>
  );
}
