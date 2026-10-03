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
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { mergeTrendSeries, publishedTrendCount, type CropTrendMetric } from "@/features/crops/trend";
import { cn } from "@/lib/cn";
import { fmtCompact, fmtNumber } from "@/lib/format";
import type { PeriodTrendResponse } from "@/types";

export type { CropTrendMetric } from "@/features/crops/trend";

/** The three published columns of the canonical period-aware crop panel. */
export const CROP_TREND_METRICS: { id: CropTrendMetric; label: string; unit: string }[] = [
  { id: "yield_kg_ha", label: "Yield", unit: "kg/ha" },
  { id: "production_mt", label: "Production", unit: "MT" },
  { id: "harvested_area_ha", label: "Harvested area", unit: "ha" },
];

/**
 * One crop across every published period, with an optional comparison overlay.
 *
 * This is the crop's own published releases — not a forecast and not a smoothed
 * trend. A period the crop was not published in is left out of the series
 * (Recharts `connectNulls={false}`), so a gap reads as a gap rather than an
 * interpolation between two real observations. The comparison line (national, or
 * another district) is aligned on the same period axis and never fills a period
 * the other side published without it.
 */
export function CropTrendChart({
  data,
  isLoading,
  metric,
  onMetricChange,
  crop,
  district,
  comparison,
  comparisonLabel,
}: {
  data?: PeriodTrendResponse;
  isLoading?: boolean;
  metric: CropTrendMetric;
  onMetricChange: (metric: CropTrendMetric) => void;
  crop?: string;
  district?: string | null;
  /** A second series to overlay, aligned on the same period codes. */
  comparison?: PeriodTrendResponse;
  /** The overlay's name, e.g. "National" or a district name. */
  comparisonLabel?: string | null;
}) {
  const motion = useChartMotion();

  const points = useMemo(
    () => mergeTrendSeries(data, comparison, metric),
    [data, comparison, metric],
  );

  const active = CROP_TREND_METRICS.find((m) => m.id === metric) ?? CROP_TREND_METRICS[0];
  const published = publishedTrendCount(points);
  const hasComparison = Boolean(comparisonLabel) && Boolean(comparison);

  if (isLoading) return <ChartSkeleton height={300} />;

  return (
    <Card>
      <CardHeader
        title={`${crop ?? "Crop"} productivity over published periods`}
        subtitle={
          hasComparison
            ? `${district ?? "National"} vs ${comparisonLabel} · observed values per published release — not a forecast`
            : district
              ? `${district} · observed values per published release — not a forecast`
              : "National observed values per published release — not a forecast"
        }
        action={
          <div
            role="group"
            aria-label="Trend metric"
            className="flex flex-wrap gap-1 rounded-lg border border-forest/10 bg-forest/[0.03] p-1"
          >
            {CROP_TREND_METRICS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={metric === option.id}
                onClick={() => onMetricChange(option.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  metric === option.id
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-forest",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {points.length === 0 || published === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No published periods for this crop and selection."
            hint="The canonical panel carries only releases the crop was actually tabulated in."
          />
        </div>
      ) : (
        <div className="h-[300px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="period" {...AXIS_PROPS} />
              <YAxis
                {...AXIS_PROPS}
                tickFormatter={(v: number) => (metric === "production_mt" ? fmtCompact(v) : fmtNumber(v, 0))}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value, name) => [
                  `${fmtNumber(Number(value), metric === "yield_kg_ha" ? 0 : 1)} ${active.unit}`,
                  String(name),
                ]}
              />
              {hasComparison ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
              <Line
                {...motion}
                type="monotone"
                dataKey="primary"
                name={`${district ?? "National"} (${active.unit})`}
                stroke={CHART.primary}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
              {hasComparison ? (
                <Line
                  {...motion}
                  type="monotone"
                  dataKey="comparison"
                  name={`${comparisonLabel} (${active.unit})`}
                  stroke={CHART.blue}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <SourceNote>
        Source: {data?.provenance.source_id ?? "NISR district productivity panel"} ·{" "}
        {published} published period{published === 1 ? "" : "s"} shown
        {hasComparison ? `, compared against ${comparisonLabel}` : ""}. Values are the panel&apos;s own
        published columns — nothing is interpolated or projected. A period only one side published is
        drawn on that side alone.
      </SourceNote>
    </Card>
  );
}
