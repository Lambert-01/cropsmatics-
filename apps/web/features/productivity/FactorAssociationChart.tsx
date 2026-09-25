"use client";

import { Info } from "lucide-react";
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
import type { FactorsResponse } from "@/types";

export function FactorAssociationChart({
  data,
  isLoading,
  crop,
}: {
  data?: FactorsResponse;
  isLoading?: boolean;
  crop?: string;
}) {
  if (!crop) {
    return (
      <Card>
        <CardHeader title="Factors Associated with Yield" />
        <div className="p-4">
          <EmptyState title="Select a crop to analyse factors associated with its yield." hint="Comparing yields across unrelated crops would distort the association." />
        </div>
      </Card>
    );
  }
  if (isLoading) return <ChartSkeleton height={300} />;

  const factors = (data?.factors ?? []).filter((f) => f.correlation != null);

  return (
    <Card>
      <CardHeader
        title="Factors Associated with Yield"
        subtitle="Pearson correlation between district practice adoption and yield"
      />
      <div className="flex items-start gap-2 px-4 pt-2 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
        <span>Association does not establish causality.</span>
      </div>
      {factors.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No factor association could be estimated."
            hint="This needs at least three matched observations for the selection."
          />
        </div>
      ) : (
        <div style={{ height: Math.max(220, factors.length * 34) }} className="px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={factors.map((f) => ({
                label: f.label,
                correlation: f.correlation,
                n: f.n_observations,
              }))}
              margin={{ top: 4, right: 24, bottom: 4, left: 12 }}
            >
              <CartesianGrid stroke={CHART.grid} horizontal={false} />
              <XAxis type="number" domain={[-1, 1]} {...AXIS_PROPS} />
              <YAxis type="category" dataKey="label" width={150} {...AXIS_PROPS} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value) => [fmtNumber(Number(value), 3), "correlation"]}
              />
              <Bar dataKey="correlation" radius={[0, 4, 4, 0]}>
                {factors.map((f) => (
                  <Cell
                    key={f.factor}
                    fill={(f.correlation ?? 0) >= 0 ? CHART.primary : CHART.amber}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Source: {data?.provenance.source_id ?? "NISR district factor table"} · n per factor is shown
        on hover. Small samples (&lt; 8) are flagged in the tooltip data as indicative only.
      </SourceNote>
    </Card>
  );
}
