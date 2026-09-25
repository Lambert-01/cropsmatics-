"use client";

import { Fragment, useState } from "react";

import { ResponsiveTable, type Column } from "@/components/table/ResponsiveTable";
import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { PriorityRow } from "@/types";

/**
 * Priority table (section H+I): units live in the headers, the permanent rows
 * carry only the decision columns, and per-row details (province, area,
 * production, priority components, benchmark strategy) expand in place instead
 * of overloading the table with permanent columns.
 */
export function PriorityTable({
  rows,
  onSelectDistrict,
  limit = 12,
  benchmarkStrategy,
}: {
  rows: PriorityRow[];
  onSelectDistrict?: (district: string) => void;
  limit?: number;
  benchmarkStrategy?: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const top = rows.slice(0, limit);

  const columns: Column<PriorityRow | (PriorityRow & { __expanded: true })>[] = [
    {
      id: "rank",
      header: "Rank",
      width: 56,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => top.indexOf(row as PriorityRow) + 1,
      cell: (row) => <span className="text-slate-400">{top.indexOf(row as PriorityRow) + 1}</span>,
    },
    {
      id: "district",
      header: "District",
      width: 130,
      sticky: true,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).district,
      cell: (row) => (
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => onSelectDistrict?.((row as PriorityRow).district)}
        >
          {(row as PriorityRow).district}
        </button>
      ),
    },
    {
      id: "crop",
      header: "Crop",
      width: 120,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).crop,
      cell: (row) => (row as PriorityRow).crop,
    },
    {
      id: "yield",
      header: "Observed yield",
      unit: "kg/ha",
      width: 110,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).yield_kg_ha ?? null,
      cell: (row) =>
        (row as PriorityRow).yield_kg_ha != null
          ? fmtNumber((row as PriorityRow).yield_kg_ha, 0)
          : "—",
    },
    {
      id: "benchmark",
      header: "Benchmark",
      unit: "kg/ha",
      width: 110,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).benchmark_yield_kg_ha ?? null,
      cell: (row) =>
        (row as PriorityRow).benchmark_yield_kg_ha != null
          ? fmtNumber((row as PriorityRow).benchmark_yield_kg_ha, 0)
          : "—",
    },
    {
      id: "gap",
      header: "Gap",
      unit: "%",
      width: 90,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).gap,
      cell: (row) => (
        <span className="font-medium">
          {fmtNumber((row as PriorityRow).gap, 1)}
          <span className="text-slate-400">%</span>
        </span>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      width: 110,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).score,
      cell: (row) => <PriorityBadge band={(row as PriorityRow).band} />,
    },
    {
      id: "details",
      header: "Details",
      width: 84,
      align: "center",
      cell: (row) => {
        const id = (row as PriorityRow).id;
        const open = expandedId === id;
        return (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${(row as PriorityRow).district}`}
            onClick={() => setExpandedId(open ? null : id)}
            className="btn px-2 py-1 text-xs"
          >
            {open ? "Hide" : "View"}
          </button>
        );
      },
    },
  ];

  // Expandable detail rows are interleaved after their parent row.
  const rowsWithDetails = top.flatMap((row) =>
    expandedId === row.id
      ? [row, { ...row, __expanded: true } as PriorityRow & { __expanded: true }]
      : [row],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Priority district / crop observations"
        subtitle="Transparent weighted score — higher means stronger case for investigation first"
      />
      {top.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="thin-scroll mt-3 max-h-[26rem] overflow-auto">
          <ResponsiveTable
            columns={columns}
            rows={rowsWithDetails}
            rowKey={(row) => ("__expanded" in row ? `${row.id}-details` : row.id)}
            initialSort={{ id: "rank", direction: "asc" }}
            caption="Priority district and crop observations with yield, benchmark, gap and priority band"
          />
        </div>
      )}
      {expandedId ? (
        <ExpandedDetails row={top.find((r) => r.id === expandedId)!} benchmarkStrategy={benchmarkStrategy} />
      ) : null}
      <SourceNote>
        Yield and benchmark in kg/ha; gap = productivity gap index (%). Weights and component values
        are transparent and adjustable on the Interventions page. Computed by Python from NISR 2025
        Season B district tables.
      </SourceNote>
    </Card>
  );
}

function ExpandedDetails({
  row,
  benchmarkStrategy,
}: {
  row: PriorityRow;
  benchmarkStrategy?: string | null;
}) {
  const items: { label: string; value: string }[] = [
    { label: "Priority score", value: `${Math.round(row.score * 100)} / 100` },
    { label: "Vulnerability", value: fmtNumber(row.vulnerability, 3) },
    { label: "Affected scale", value: fmtNumber(row.affected_scale, 3) },
    { label: "Readiness", value: fmtNumber(row.readiness, 3) },
    { label: "Cost constraint", value: fmtNumber(row.cost_constraint, 3) },
    {
      label: "Harvested area",
      value: row.harvested_area_ha != null ? `${fmtNumber(row.harvested_area_ha, 0)} ha` : "—",
    },
    {
      label: "Benchmark yield",
      value: row.benchmark_yield_kg_ha != null ? `${fmtNumber(row.benchmark_yield_kg_ha, 0)} kg/ha` : "—",
    },
    { label: "Benchmark strategy", value: benchmarkStrategy ?? "national crop median" },
    { label: "Period", value: "2025 Season B (latest district data)" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-forest/10 bg-forest/[0.03] px-4 py-3 text-xs sm:grid-cols-3">
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt className="font-medium text-slate-500">{item.label}</dt>
          <dd className="text-slate-700">{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
