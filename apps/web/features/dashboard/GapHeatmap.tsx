"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { HeatmapResponse } from "@/types";

export function GapHeatmap({
  data,
  isLoading,
}: {
  data?: HeatmapResponse;
  isLoading?: boolean;
}) {
  if (isLoading) return <TableSkeleton rows={8} />;

  // A ranked bar chart preserves the exact cell values while making the answer
  // scannable. The former matrix required horizontal scrolling and forced users
  // to decode colour plus rotated crop labels before finding the largest gaps.
  const rows = (data?.cells ?? [])
    .filter((cell) => typeof cell.value === "number" && Number.isFinite(cell.value))
    .map((cell) => ({
      label: `${cell.district} · ${cell.crop}`,
      district: cell.district,
      crop: cell.crop,
      value: cell.value as number,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 12);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Largest productivity gaps"
        subtitle="Top district × crop shortfalls against each crop's benchmark"
      />
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="h-[320px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 20, bottom: 8, left: 10 }}>
              <CartesianGrid stroke="#EDF3F0" horizontal={false} />
              <XAxis type="number" tickFormatter={(value: number) => `${fmtNumber(value, 0)}%`} />
              <YAxis
                type="category"
                dataKey="label"
                width={132}
                tick={{ fontSize: 10, fill: "#475569" }}
                tickFormatter={(value: string) => value.length > 22 ? `${value.slice(0, 22)}…` : value}
              />
              <Tooltip
                formatter={(value: unknown) => [
                  `${fmtNumber(typeof value === "number" ? value : Number(value ?? 0), 1)}%`,
                  "Gap index",
                ]}
                labelFormatter={(label) => label}
              />
              <Bar dataKey="value" name="Gap index" fill="#D97706" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Values are Python-computed district × crop gap indices. A positive value means the
        observed yield is below that crop&apos;s benchmark; blank observations are omitted.
      </SourceNote>
    </Card>
  );
}
