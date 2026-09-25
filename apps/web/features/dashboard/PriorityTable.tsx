"use client";

import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { PriorityRow } from "@/types";

export function PriorityTable({
  rows,
  onSelectDistrict,
  limit = 12,
}: {
  rows: PriorityRow[];
  onSelectDistrict?: (district: string) => void;
  limit?: number;
}) {
  const top = rows.slice(0, limit);

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
        <div className="thin-scroll mt-3 max-h-[24rem] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>District</th>
                <th>Crop</th>
                <th className="text-right">Yield</th>
                <th className="text-right">Benchmark</th>
                <th className="text-right">Gap</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row, i) => (
                <tr key={row.id}>
                  <td className="text-slate-400">{i + 1}</td>
                  <td>
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => onSelectDistrict?.(row.district)}
                    >
                      {row.district}
                    </button>
                  </td>
                  <td>{row.crop}</td>
                  <td className="text-right">
                    {row.yield_kg_ha != null ? `${fmtNumber(row.yield_kg_ha, 0)}` : "—"}
                  </td>
                  <td className="text-right">
                    {row.benchmark_yield_kg_ha != null
                      ? `${fmtNumber(row.benchmark_yield_kg_ha, 0)}`
                      : "—"}
                  </td>
                  <td className="text-right font-medium">
                    {fmtNumber(row.gap, 1)}
                    <span className="text-slate-400">%</span>
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
        Yield and benchmark in kg/ha; gap = productivity gap index (%). Weights and component values
        are transparent and adjustable on the Interventions page. Computed by Python from NISR 2025
        Season B district tables.
      </SourceNote>
    </Card>
  );
}
