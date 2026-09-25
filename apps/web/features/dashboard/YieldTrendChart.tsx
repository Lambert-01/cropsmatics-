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
import { NationalContextBadge } from "@/components/ui/NationalContextBadge";
import { ChartSkeleton, EmptyState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { fmtCompact, fmtNumber, periodLabel } from "@/lib/format";
import type { TrendResponse } from "@/types";

const COMPARE_COLORS = [CHART.primary, CHART.amber, CHART.blue, CHART.green, "#7c3aed"];

export function YieldTrendChart({
  data,
  isLoading,
  crop,
}: {
  data?: TrendResponse;
  isLoading?: boolean;
  crop?: string;
}) {
  const isCompare = data?.kind === "crop_trends_compare";

  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        period: periodLabel(p.period),
        ...(isCompare ? p.values : {
          production_mt: p.values.production_mt ?? null,
          yield_t_ha: p.values.yield_mt_ha ?? null,
        }),
      })),
    [data, isCompare],
  );

  const compareSeries = useMemo(() => {
    if (!isCompare || !data || data.points.length === 0) return [];
    return Object.keys(data.metric_units)
      .filter((k) => k.endsWith(":harvested_area_ha") || k.endsWith(":production_mt"))
      .map((k) => ({
        key: k,
        label: k.split(":")[1] + (k.endsWith("production_mt") ? " — production (MT)" : " — harvested area (ha)"),
      }));
  }, [isCompare, data]);

  if (isLoading) return <ChartSkeleton />;

  return (
    <Card>
      <CardHeader
        title={
          isCompare
            ? `Crop comparison (${data?.compared_crops?.length ?? 0} crops)`
            : crop
              ? `${crop} national trend`
              : "National crop trend"
        }
        subtitle={
          isCompare
            ? "Harvested area and production per crop — yield is not compared across crops (incomparable natural scales)"
            : "Production and yield by published period — only real periods are shown"
        }
        action={
          isCompare ? <NationalContextBadge note="district filter not applicable" /> : undefined
        }
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
              {isCompare
                ? compareSeries.map((s, i) => (
                    <Line
                      key={s.key}
                      yAxisId="left"
                      dataKey={s.key}
                      name={s.label}
                      stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      connectNulls={false}
                    />
                  ))
                : (
                  <>
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
                  </>
                )}
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
