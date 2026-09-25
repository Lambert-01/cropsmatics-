"use client";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { ProductivityResponse } from "@/types";

type Row = ProductivityResponse["rows"][number];

function num(row: Row, key: string): number | null {
  const v = row[key];
  return typeof v === "number" ? v : null;
}

export function DistrictRankingTable({
  rows,
  onSelectDistrict,
}: {
  rows: ProductivityResponse["rows"];
  onSelectDistrict?: (district: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="District ranking"
        subtitle="Observed vs benchmark yield for the current selection"
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="thin-scroll mt-3 max-h-[30rem] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>District</th>
                <th className="text-right">Observed yield</th>
                <th className="text-right">Benchmark</th>
                <th className="text-right">Gap</th>
                <th className="text-right">Harvested area</th>
                <th className="text-right">Production</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const gap = num(row, "gap_index");
                const district = String(row.district);
                return (
                  <tr key={district}>
                    <td>
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => onSelectDistrict?.(district)}
                      >
                        {district}
                      </button>
                      <span className="ml-2 text-xs text-slate-400">{row.province ?? ""}</span>
                    </td>
                    <td className="text-right">{fmtNumber(num(row, "yield_kg_ha"), 0)}</td>
                    <td className="text-right">{fmtNumber(num(row, "benchmark_yield_kg_ha"), 0)}</td>
                    <td
                      className={`text-right font-medium ${
                        gap != null && gap > 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {fmtNumber(gap, 1)}%
                    </td>
                    <td className="text-right">{fmtNumber(num(row, "harvested_area_ha"), 0)}</td>
                    <td className="text-right">{fmtNumber(num(row, "production_mt"), 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <SourceNote>
        Yield in kg/ha, harvested area in ha, production in metric tonnes. Gap index is computed by
        Python against the selected benchmark strategy.
      </SourceNote>
    </Card>
  );
}
