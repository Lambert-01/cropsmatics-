"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { fmtCompact, fmtNumber, periodLabel } from "@/lib/format";
import type { TrendResponse } from "@/types";

export function YieldTrendChart({
  data,
  isLoading,
  crop,
}: {
  data?: TrendResponse;
  isLoading?: boolean;
  crop?: string;
}) {
  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        period: periodLabel(p.period),
        production_mt: p.values.production_mt ?? null,
        yield_t_ha: p.values.yield_mt_ha ?? null,
      })),
    [data],
  );

  if (isLoading) return <ChartSkeleton />;

  return (
    <Card>
      <CardHeader
        title={crop ? `${crop} national trend` : "National crop trend"}
        subtitle="Production and yield by published period — only real periods are shown"
      />
      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="h-[280px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="period" {...AXIS_PROPS} />
              <YAxis
                yAxisId="left"
                {...AXIS_PROPS}
                tickFormatter={(v: number) => fmtCompact(v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                {...AXIS_PROPS}
                tickFormatter={(v: number) => fmtNumber(v, 1)}
              />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="left"
                dataKey="production_mt"
                name="Production (metric tonnes)"
                fill={CHART.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
              />
              <Line
                yAxisId="right"
                dataKey="yield_t_ha"
                name="Yield (t/ha)"
                stroke={CHART.amber}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Source: {data?.provenance.source_id ?? "NISR national trend table"} · units: production =
        metric tonnes, yield = tonnes per hectare. National series are context, not district
        estimates.
      </SourceNote>
    </Card>
  );
}
