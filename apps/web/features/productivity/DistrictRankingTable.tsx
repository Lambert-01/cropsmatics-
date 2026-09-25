"use client";

import { ResponsiveTable, type Column } from "@/components/table/ResponsiveTable";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { ProductivityResponse } from "@/types";

type Row = ProductivityResponse["rows"][number];

function num(row: Row, key: string): number | null {
  const v = row[key];
  return typeof v === "number" ? v : null;
}

/**
 * District ranking (section J): sortable observed yield, benchmark, gap,
 * harvested area and production; units live in the headers; the District
 * column stays sticky while numeric columns scroll on narrow screens.
 */
export function DistrictRankingTable({
  rows,
  onSelectDistrict,
}: {
  rows: ProductivityResponse["rows"];
  onSelectDistrict?: (district: string) => void;
}) {
  const columns: Column<Row>[] = [
    {
      id: "district",
      header: "District",
      width: 170,
      sticky: true,
      sortable: true,
      sortValue: (row) => String(row.district),
      cell: (row) => (
        <span>
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => onSelectDistrict?.(String(row.district))}
          >
            {String(row.district)}
          </button>
          <span className="ml-2 text-xs text-slate-400">{row.province ?? ""}</span>
        </span>
      ),
    },
    {
      id: "yield",
      header: "Observed yield",
      unit: "kg/ha",
      width: 120,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => num(row, "yield_kg_ha"),
      cell: (row) => fmtNumber(num(row, "yield_kg_ha"), 0),
    },
    {
      id: "benchmark",
      header: "Benchmark",
      unit: "kg/ha",
      width: 120,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => num(row, "benchmark_yield_kg_ha"),
      cell: (row) => fmtNumber(num(row, "benchmark_yield_kg_ha"), 0),
    },
    {
      id: "gap",
      header: "Gap",
      unit: "%",
      width: 90,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => num(row, "gap_index"),
      cell: (row) => {
        const gap = num(row, "gap_index");
        return (
          <span className={`font-medium ${gap != null && gap > 0 ? "text-danger" : "text-success"}`}>
            {fmtNumber(gap, 1)}%
          </span>
        );
      },
    },
    {
      id: "area",
      header: "Harvested area",
      unit: "ha",
      width: 120,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => num(row, "harvested_area_ha"),
      cell: (row) => fmtNumber(num(row, "harvested_area_ha"), 0),
    },
    {
      id: "production",
      header: "Production",
      unit: "MT",
      width: 110,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => num(row, "production_mt"),
      cell: (row) => fmtNumber(num(row, "production_mt"), 0),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="District ranking"
        subtitle="Observed vs benchmark yield for the current selection — click a column to sort"
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="thin-scroll mt-3 max-h-[30rem] overflow-auto">
          <ResponsiveTable
            columns={columns}
            rows={rows}
            rowKey={(row) => String(row.district)}
            initialSort={{ id: "gap", direction: "desc" }}
            caption="District ranking by observed yield, benchmark, gap, harvested area and production"
          />
        </div>
      )}
      <SourceNote>
        Yield in kg/ha, harvested area in ha, production in metric tonnes. Gap index is computed by
        Python against the selected benchmark strategy.
      </SourceNote>
    </Card>
  );
}
