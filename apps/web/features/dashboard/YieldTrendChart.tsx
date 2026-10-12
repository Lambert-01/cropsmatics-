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
import { ChartSkeleton, EmptyState, ErrorState, UpdatingPill } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { chartDisplayState, isUpdating as showUpdating } from "@/lib/chartState";
import { fmtCompact, fmtNumber, periodLabel } from "@/lib/format";
import type { TrendResponse } from "@/types";

const COMPARE_COLORS = [CHART.primary, CHART.amber, CHART.blue, CHART.green, "#7c3aed"];

export function YieldTrendChart({
  data,
  isLoading,
  isFetching,
  hasError,
  errorMessage,
  onRetry,
  crop,
}: {
  data?: TrendResponse;
  isLoading?: boolean;
  /** A newer response is in flight for the same scope while `data` is still valid. */
  isFetching?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  crop?: string;
}) {
  const motion = useChartMotion();
  const isCompare = data?.kind === "crop_trends_compare";
  const chartTitle = isCompare
    ? `Crop comparison (${data?.compared_crops?.length ?? 0} crops)`
    : crop
      ? `${crop} national trend`
      : "National crop trend";
  const updating = showUpdating({ hasData: (data?.points?.length ?? 0) > 0, isFetching });

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

  // A skeleton is shown only when there is genuinely nothing to read. Once a
  // response has loaded, a later refetch (or even a failure) must not replace the
  // chart with a placeholder - that is what made the national trend appear and
  // then disappear after a filter change. The rule itself lives in
  // `lib/chartState`, where it is unit tested.
  const state = chartDisplayState({ hasData: points.length > 0, isLoading, hasError });
  if (state === "loading") return <ChartSkeleton />;
  if (state === "error") {
    return (
      <Card>
        <CardHeader title={chartTitle} subtitle="The published national series could not be loaded" />
        <div className="p-4">
          <ErrorState message={errorMessage} onRetry={onRetry} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={chartTitle}
        subtitle={
          isCompare
            ? "Harvested area and production per crop — yield is not compared across crops (incomparable natural scales)"
            : "Production (metric tonnes, left axis) and yield (t/ha, right axis) by published period"
        }
        action={
          <div className="flex items-center gap-2">
            {isCompare ? <NationalContextBadge note="district filter not applicable" /> : null}
            <UpdatingPill active={updating} />
          </div>
        }
      />
      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No national trend is published for this selection."
            hint={
              crop
                ? `No published production/yield series for ${crop}. Try another crop, or clear the crop filter for the national aggregate.`
                : "No published national trend rows were returned. Try another period or refresh the catalogue."
            }
          />
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
                      {...motion}
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
                      {...motion}
                      yAxisId="left"
                      dataKey="production_mt"
                      name="Production (metric tonnes)"
                      fill={CHART.primary}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={38}
                    />
                    <Line
                      {...motion}
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
