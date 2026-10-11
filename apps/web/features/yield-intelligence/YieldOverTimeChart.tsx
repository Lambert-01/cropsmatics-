"use client";

import { Info, LineChart as LineChartIcon } from "lucide-react";
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
import { yieldOverlayPoints } from "@/features/crops/trend";
import { cn } from "@/lib/cn";
import { fmtCompact, fmtNumber } from "@/lib/format";
import type { PeriodTrendResponse } from "@/types";

export type YieldTrendMode = "sequential" | "same_season";

/**
 * Yield over time (section 1).
 *
 * Two views of the same published series:
 *
 * * **Same season** compares like with like (Season B: 2024B -> 2025B -> 2026B).
 *   This is the analytically honest way to read year-on-year movement.
 * * **Sequential** shows every published period in order, which is *not* a time
 *   series: Season A and Season B are different agronomic seasons, so a step
 *   from 2024A to 2024B is not growth. The chart says so explicitly instead of
 *   letting the line imply continuity.
 */
export function YieldOverTimeChart({
  data,
  isLoading,
  crop,
  district,
  season,
  mode,
  onModeChange,
  comparison,
  comparisonLabel,
}: {
  data?: PeriodTrendResponse;
  isLoading?: boolean;
  crop?: string;
  district?: string | null;
  season?: string;
  mode: YieldTrendMode;
  onModeChange: (mode: YieldTrendMode) => void;
  /** A second series whose yield is overlaid on the same season/period axis. */
  comparison?: PeriodTrendResponse;
  comparisonLabel?: string | null;
}) {
  const motion = useChartMotion();
  const hasComparison = Boolean(comparison) && Boolean(comparisonLabel);

  // The same-season view needs a season to compare on. Without a selected
  // period it silently degrades to the sequential view rather than labelling
  // every period as "same season".
  const sameSeasonAvailable = Boolean(season);
  const effectiveMode: YieldTrendMode =
    mode === "same_season" && !sameSeasonAvailable ? "sequential" : mode;

  const points = useMemo(
    () =>
      yieldOverlayPoints(data, comparison, {
        sameSeasonOnly: effectiveMode === "same_season",
        season,
      }),
    [data, comparison, effectiveMode, season],
  );

  const scope = district ?? "national published series";

  if (!crop) {
    return (
      <Card>
        <CardHeader title="Yield over time" />
        <div className="p-4">
          <EmptyState
            title="Select a crop to see its yield across seasons."
            hint="Yield is crop-specific: kg/ha from maize, beans and potato are not on a shared scale."
          />
        </div>
      </Card>
    );
  }

  if (isLoading) return <ChartSkeleton height={320} />;

  return (
    <Card>
      <CardHeader
        title="Yield over time"
        subtitle={hasComparison ? `${crop} · ${scope} vs ${comparisonLabel}` : `${crop} · ${scope}`}
        action={
          <div
            role="group"
            aria-label="Trend view"
            className="flex flex-wrap gap-1 rounded-lg border border-forest/10 bg-forest/[0.03] p-1"
          >
            {(
              [
                {
                  id: "same_season",
                  label: season ? `Season ${season} only` : "Same season",
                  disabled: !sameSeasonAvailable,
                },
                { id: "sequential", label: "All periods", disabled: false },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={effectiveMode === option.id}
                disabled={option.disabled}
                title={
                  option.disabled
                    ? "Choose a period to enable the same-season comparison"
                    : undefined
                }
                onClick={() => onModeChange(option.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  effectiveMode === option.id
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-forest",
                  option.disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex items-start gap-2 px-4 pt-2 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
        <span>
          {effectiveMode === "same_season"
            ? `Comparing the same season across years${season ? ` (Season ${season})` : ""}. This is the valid year-on-year read, because agricultural seasons differ agronomically.`
            : "Every published period in order. This is not a time series: Season A and Season B are different agronomic seasons, so you should not read the line as continuous growth."}
        </span>
      </div>

      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title={
              effectiveMode === "same_season"
                ? `${crop} has no published observations for ${season ? `Season ${season}` : "this season"}.`
                : `${crop} has no published observations in the panel.`
            }
            hint="A period is only shown when the release actually tabulated this crop; missing periods are not drawn as zeros."
          />
        </div>
      ) : (
        <div className="h-[300px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" {...AXIS_PROPS} />
              <YAxis
                yAxisId="yield"
                {...AXIS_PROPS}
                width={64}
                tickFormatter={(v: number) => fmtCompact(v)}
              />
              <YAxis
                yAxisId="production"
                orientation="right"
                {...AXIS_PROPS}
                tickFormatter={(v: number) => fmtCompact(v)}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value, name) => [
                  String(name).includes("kg/ha")
                    ? `${fmtNumber(Number(value), 0)} kg/ha`
                    : `${fmtNumber(Number(value), 0)} MT`,
                  name as string,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                {...motion}
                yAxisId="yield"
                type="monotone"
                dataKey="yield_kg_ha"
                name="Yield (kg/ha)"
                stroke={CHART.primary}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls={false}
              />
              <Line
                {...motion}
                yAxisId="production"
                type="monotone"
                dataKey="production_mt"
                name="Production (MT)"
                stroke={CHART.amber}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={{ r: 3 }}
                connectNulls={false}
              />
              {hasComparison ? (
                <Line
                  {...motion}
                  yAxisId="yield"
                  type="monotone"
                  dataKey="comparison_yield_kg_ha"
                  name={`${comparisonLabel} yield (kg/ha)`}
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
        <span className="inline-flex items-center gap-1.5">
          <LineChartIcon className="h-3 w-3" aria-hidden="true" />
          Source: {data?.provenance.source_id ?? "crop_productivity panel"} ·{" "}
          {periodsLabel(points.map((p) => p.period_code))}. A gap in the line means the crop was
          not tabulated for that period — it is never drawn as zero.
        </span>
      </SourceNote>
    </Card>
  );
}

function periodsLabel(codes: string[]): string {
  if (codes.length === 0) return "no published periods";
  if (codes.length === 1) return codes[0];
  return `${codes[0]}–${codes[codes.length - 1]}`;
}
