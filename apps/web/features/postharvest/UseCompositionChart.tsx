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
import type { PostHarvestCrop } from "@/types";

const SERIES = [
  { key: "sold_pct", label: "Sold", color: CHART.primary },
  { key: "own_consumption_pct", label: "Own consumption", color: CHART.blue },
  { key: "stored_pct", label: "Stored", color: CHART.amber },
  { key: "seeds_pct", label: "Seeds", color: CHART.green },
  { key: "fodder_pct", label: "Fodder", color: "#0f766e" },
  { key: "other_usage_pct", label: "Other", color: "#94a3b8" },
];

export function UseCompositionChart({
  crops,
  isLoading,
}: {
  crops: PostHarvestCrop[];
  isLoading?: boolean;
}) {
  if (isLoading) return <ChartSkeleton height={340} />;

  const data = crops.map((c) => ({
    crop: c.crop,
    sold_pct: c.sold_pct ?? 0,
    own_consumption_pct: c.own_consumption_pct ?? 0,
    stored_pct: c.stored_pct ?? 0,
    seeds_pct: c.seeds_pct ?? 0,
    fodder_pct: c.fodder_pct ?? 0,
    other_usage_pct: c.other_usage_pct ?? 0,
    losses: c.post_harvest_losses_pct ?? 0,
  }));

  return (
    <Card>
      <CardHeader
        title="Production use composition"
        subtitle="How each crop's production is used (share of production, %)"
      />
      {data.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="h-[360px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 60, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="crop"
                {...AXIS_PROPS}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={70}
              />
              <YAxis {...AXIS_PROPS} unit="%" domain={[0, 100]} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="use" fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Shares are the official published values and may not sum to exactly 100 because of rounding;
        the pipeline flags any row outside a 1-point tolerance.
      </SourceNote>
    </Card>
  );
}
