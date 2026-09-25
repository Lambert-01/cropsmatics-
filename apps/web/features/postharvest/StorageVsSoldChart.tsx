"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { fmtNumber } from "@/lib/format";
import type { PostHarvestCrop } from "@/types";

/** How much of each crop is stored versus sold immediately (national, crop level). */
export function StorageVsSoldChart({
  crops,
  isLoading,
}: {
  crops: PostHarvestCrop[];
  isLoading?: boolean;
}) {
  if (isLoading) return <ChartSkeleton height={340} />;

  const data = crops
    .filter((c) => c.stored_pct != null || c.sold_pct != null)
    .sort((a, b) => (b.stored_pct ?? 0) - (a.stored_pct ?? 0))
    .map((c) => ({
      crop: c.crop,
      stored: c.stored_pct ?? 0,
      sold: c.sold_pct ?? 0,
    }));

  return (
    <Card>
      <CardHeader
        title="Stored vs sold share by crop"
        subtitle="Share of production held for storage compared with sold at harvest"
      />
      {data.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div style={{ height: Math.max(300, data.length * 24) }} className="px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 4, right: 24, bottom: 4, left: 12 }}
            >
              <CartesianGrid stroke={CHART.grid} horizontal={false} />
              <XAxis type="number" {...AXIS_PROPS} unit="%" />
              <YAxis type="category" dataKey="crop" width={110} {...AXIS_PROPS} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value, name) => [
                  `${fmtNumber(Number(value), 2)}%`,
                  name === "stored" ? "stored" : "sold",
                ]}
              />
              <Legend
                verticalAlign="top"
                height={24}
                formatter={(v) => (v === "stored" ? "Stored" : "Sold")}
              />
              <Bar dataKey="stored" fill={CHART.primary} radius={[0, 3, 3, 0]} />
              <Bar dataKey="sold" fill={CHART.amber} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Source: NISR SAS 2025 Season B Table 14. National crop-level shares of production — not
        district values and not tonnages.
      </SourceNote>
    </Card>
  );
}
