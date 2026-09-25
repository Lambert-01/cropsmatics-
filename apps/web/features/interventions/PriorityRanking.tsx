"use client";

import { Fragment, useMemo, useState } from "react";

import { ResponsiveTable, type Column } from "@/components/table/ResponsiveTable";
import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { PriorityRow } from "@/types";

/**
 * Intervention priority ranking (section K): sortable District, Crop, Gap and
 * Score with numeric alignment, plus an expandable Details row showing the
 * priority components instead of overloading the default row.
 */
export function PriorityRanking({
  rows,
  isLoading,
  selectedId,
  onSelect,
}: {
  rows: PriorityRow[];
  isLoading?: boolean;
  selectedId?: string | null;
  onSelect: (row: PriorityRow) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rowsWithDetails = useMemo(
    () =>
      rows.flatMap((row) =>
        expandedId === row.id
          ? [row, { ...row, __expanded: true } as PriorityRow & { __expanded: true }]
          : [row],
      ),
    [rows, expandedId],
  );

  const rankOf = (row: PriorityRow) => rows.findIndex((r) => r.id === row.id) + 1;

  const columns: Column<PriorityRow | (PriorityRow & { __expanded: true })>[] = [
    {
      id: "rank",
      header: "#",
      width: 48,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => rankOf(row as PriorityRow),
      cell: (row) => <span className="text-slate-400">{rankOf(row as PriorityRow)}</span>,
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
          className={`font-medium hover:underline ${
            selectedId === (row as PriorityRow).id ? "text-forest-deep" : "text-primary"
          }`}
          onClick={() => onSelect(row as PriorityRow)}
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
      id: "gap",
      header: "Gap",
      unit: "%",
      width: 90,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).gap,
      cell: (row) => `${fmtNumber((row as PriorityRow).gap, 1)}%`,
    },
    {
      id: "score",
      header: "Score",
      width: 90,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => (row as PriorityRow).score,
      cell: (row) => (
        <span className="font-medium">{fmtNumber((row as PriorityRow).score * 100, 0)}</span>
      ),
    },
    {
      id: "band",
      header: "Band",
      width: 110,
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
            aria-label={`${open ? "Hide" : "Show"} components for ${(row as PriorityRow).district} ${(row as PriorityRow).crop}`}
            onClick={() => setExpandedId(open ? null : id)}
            className="btn px-2 py-1 text-xs"
          >
            {open ? "Hide" : "View"}
          </button>
        );
      },
    },
  ];

  if (isLoading) return <TableSkeleton rows={10} />;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Priority ranking"
        subtitle="District × crop observations, highest score first — click a column to sort"
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="thin-scroll mt-3 max-h-[32rem] overflow-auto">
          <ResponsiveTable
            columns={columns}
            rows={rowsWithDetails}
            rowKey={(row) => ("__expanded" in row ? `${row.id}-details` : row.id)}
            initialSort={{ id: "score", direction: "desc" }}
            caption="Intervention priority ranking with gap, score, band and expandable components"
          />
        </div>
      )}
      {expandedId
        ? (() => {
            const row = rows.find((r) => r.id === expandedId);
            return row ? <ExpandedComponents row={row} /> : null;
          })()
        : null}
      <SourceNote>
        Score = weighted, min-max normalised components. Cost constraint is subtracted. Decision
        support only — not a binding decision.
      </SourceNote>
    </Card>
  );
}

function ExpandedComponents({ row }: { row: PriorityRow }) {
  const items: { label: string; value: string }[] = [
    { label: "Priority score", value: `${Math.round(row.score * 100)} / 100` },
    { label: "Vulnerability", value: fmtNumber(row.vulnerability, 3) },
    { label: "Affected scale", value: fmtNumber(row.affected_scale, 3) },
    { label: "Readiness", value: fmtNumber(row.readiness, 3) },
    { label: "Cost constraint", value: fmtNumber(row.cost_constraint, 3) },
    {
      label: "Benchmark yield",
      value:
        row.benchmark_yield_kg_ha != null ? `${fmtNumber(row.benchmark_yield_kg_ha, 0)} kg/ha` : "—",
    },
    {
      label: "Harvested area",
      value: row.harvested_area_ha != null ? `${fmtNumber(row.harvested_area_ha, 0)} ha` : "—",
    },
    { label: "Observed yield", value: row.yield_kg_ha != null ? `${fmtNumber(row.yield_kg_ha, 0)} kg/ha` : "—" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-forest/10 bg-forest/[0.03] px-4 py-3 text-xs sm:grid-cols-4">
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt className="font-medium text-slate-500">{item.label}</dt>
          <dd className="text-slate-700">{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
