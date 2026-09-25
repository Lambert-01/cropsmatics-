"use client";

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

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { fmtNumber } from "@/lib/format";
import type { PostHarvestCrop } from "@/types";

export function LossByCropChart({
  crops,
  isLoading,
}: {
  crops: PostHarvestCrop[];
  isLoading?: boolean;
}) {
  if (isLoading) return <ChartSkeleton height={340} />;

  const data = crops
    .filter((c) => c.post_harvest_losses_pct != null)
    .sort((a, b) => (b.post_harvest_losses_pct ?? 0) - (a.post_harvest_losses_pct ?? 0))
    .map((c) => ({ crop: c.crop, loss: c.post_harvest_losses_pct ?? 0 }));

  return (
    <Card>
      <CardHeader
        title="Post-harvest loss share by crop"
        subtitle="Reported share of production lost after harvest (national, crop level)"
      />
      {data.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div style={{ height: Math.max(280, data.length * 22) }} className="px-2 pt-3">
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
                formatter={(value) => [`${fmtNumber(Number(value), 2)}%`, "loss share"]}
              />
              <Bar dataKey="loss" radius={[0, 4, 4, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.crop}
                    fill={d.loss >= 1 ? CHART.red : d.loss >= 0.5 ? CHART.amber : CHART.primary}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Source: NISR SAS 2025 Season B Table 14. National crop-level values — not district
        estimates. Colours reflect documented heuristic bands, not calibrated probabilities.
      </SourceNote>
    </Card>
  );
}
