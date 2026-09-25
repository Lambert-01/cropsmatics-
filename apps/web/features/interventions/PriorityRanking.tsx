"use client";

import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { PriorityRow } from "@/types";

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
  if (isLoading) return <TableSkeleton rows={10} />;

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Priority ranking" subtitle="District × crop observations, highest score first" />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="thin-scroll mt-3 max-h-[32rem] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>District</th>
                <th>Crop</th>
                <th className="text-right">Gap</th>
                <th className="text-right">Score</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={selectedId === row.id ? "bg-primary/[0.07]" : undefined}
                >
                  <td className="text-slate-400">{i + 1}</td>
                  <td>
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => onSelect(row)}
                    >
                      {row.district}
                    </button>
                  </td>
                  <td>{row.crop}</td>
                  <td className="text-right">{fmtNumber(row.gap, 1)}%</td>
                  <td className="text-right tabular-nums font-medium">
                    {fmtNumber(row.score * 100, 0)}
                  </td>
                  <td>
                    <PriorityBadge band={row.band} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SourceNote>
        Score = weighted, min-max normalised components. Cost constraint is subtracted. Decision
        support only — not a binding decision.
      </SourceNote>
    </Card>
  );
}
