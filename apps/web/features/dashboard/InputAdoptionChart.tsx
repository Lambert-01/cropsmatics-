"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { periodLabel } from "@/lib/format";
import type { TrendResponse } from "@/types";

const SERIES = [
  { key: "improved_seed_pct", label: "Improved seed", color: CHART.primary },
  { key: "inorganic_fertilizer_pct", label: "Inorganic fertilizer", color: CHART.blue },
  { key: "organic_fertilizer_pct", label: "Organic fertilizer", color: CHART.green },
  { key: "pesticide_pct", label: "Pesticide", color: CHART.amber },
  { key: "irrigation_pct", label: "Irrigation", color: "#7c3aed" },
  { key: "anti_erosion_pct", label: "Anti-erosion", color: "#0f766e" },
];

export function InputAdoptionChart({
  data,
  isLoading,
}: {
  data?: TrendResponse;
  isLoading?: boolean;
}) {
  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        period: periodLabel(p.period),
        ...p.values,
      })),
    [data],
  );

  if (isLoading) return <ChartSkeleton />;

  return (
    <Card>
      <CardHeader
        title="Input & practice adoption (national)"
        subtitle="Share of farmers reporting each practice, by published period"
      />
      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="h-[280px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="period" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} domain={[0, 100]} unit="%" />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Source: {data?.provenance.source_id ?? "NISR input/practice trend table"}. Series begin in
        different periods; a missing point is shown as absent, never as zero.
      </SourceNote>
    </Card>
  );
}
