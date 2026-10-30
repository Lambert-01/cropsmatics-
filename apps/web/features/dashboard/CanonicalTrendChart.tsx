"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState, ErrorState, UpdatingPill } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { chartDisplayState, isUpdating as showUpdating } from "@/lib/chartState";
import { fmtCompact, fmtNumber, periodLabel } from "@/lib/format";
import type { CanonicalTrendResponse } from "@/types";

const KG_PER_TONNE = 1000;

/**
 * The canonical 2022A-2026B trend.
 *
 * Reads `/analytics/canonical-trend`, whose axis is every period the productivity
 * panel publishes - so a period the release did not tabulate is a gap in the
 * line, never an interpolated or zero point. Production is a bar on the left
 * axis and yield a line on the right axis; raw per-crop yields are comparable
 * only within one crop, so the chart never derives a cross-crop yield itself -
 * the all-crops view uses the area-weighted aggregate yield the API computes.
 */
export function CanonicalTrendChart({
  data,
  isLoading,
  isFetching,
  hasError,
  errorMessage,
  onRetry,
  crop,
  district,
  selectedPeriod,
}: {
  data?: CanonicalTrendResponse;
  isLoading?: boolean;
  /** A newer response is in flight for the same scope while `data` is valid. */
  isFetching?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  crop?: string;
  district?: string;
  /** The period selection marks the full history axis; it does not hide other releases. */
  selectedPeriod?: string;
}) {
  const motion = useChartMotion();
  const scope = district && crop ? `${crop} · ${district}` : crop ? `${crop} national` : "National totals";
  const selectedPeriodLabel = selectedPeriod ? periodLabel(selectedPeriod) : null;
  const updating = showUpdating({ hasData: (data?.periods?.length ?? 0) > 0, isFetching });

  const points = useMemo(() => {
    if (!data) return [];
    const { periods, period_labels: labels, series } = data;
    const yieldKg = series?.yield_kg_ha ?? [];
    const yieldFromTotals = series?.yield_from_totals_kg_ha ?? [];
    const production = series?.production_mt ?? [];
    return periods.map((code, index) => {
      // One crop reports its published yield; the all-crops view reports only an
      // area-weighted aggregate yield. Prefer a real per-crop yield, then the
      // aggregate one - never a bare cross-crop average.
      const perCrop = yieldKg[index];
      const weighted = yieldFromTotals[index];
      const yieldKgHa = perCrop ?? weighted ?? null;
      return {
        period: labels?.[code] ?? code,
        period_code: code,
        production_mt: production[index] ?? null,
        yield_t_ha: yieldKgHa == null ? null : yieldKgHa / KG_PER_TONNE,
      };
    });
  }, [data]);

  const state = chartDisplayState({
    hasData: points.length > 0,
    isLoading,
    hasError,
  });
  if (state === "loading") return <ChartSkeleton />;
  if (state === "error") {
    return (
      <Card>
        <CardHeader
          title={`${scope} trend`}
          subtitle="The canonical multi-period series could not be loaded"
        />
        <div className="p-4">
          <ErrorState message={errorMessage} onRetry={onRetry} />
        </div>
      </Card>
    );
  }

  const isWeightedYield = !crop;
  const hasSelectedPeriod = Boolean(
    selectedPeriodLabel && points.some((point) => point.period === selectedPeriodLabel),
  );
  const scopeNote = district && !crop
    ? "District selection needs a crop for this trend; showing national totals."
    : district && crop
      ? `Crop and district filters applied: ${crop} · ${district}.`
      : crop
        ? `Crop filter applied: ${crop} national series.`
        : "All-crops national series. Benchmark and province filters apply to other panels, not this observed trend.";

  return (
    <Card>
      <CardHeader
        title={`${scope} trend`}
        subtitle={
          isWeightedYield
            ? "Production (metric tonnes, left axis) and area-weighted aggregate yield (t/ha, right axis) across every published period"
            : "Production (metric tonnes, left axis) and published yield (t/ha, right axis) across every published period"
        }
        action={<UpdatingPill active={updating} />}
      />
      <div className="px-4 pt-2 text-[11px] leading-relaxed text-slate-500">
        {scopeNote} {selectedPeriodLabel && hasSelectedPeriod
          ? `${selectedPeriodLabel} is highlighted; the full published history remains visible.`
          : "Select a period to highlight it on the history axis."}
      </div>
      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No published history is available for this selection."
            hint={
              district
                ? `The canonical panel publishes no district rows for ${crop ?? "this crop"} in ${district}. Try another district or clear the selection.`
                : "No published national series matched this selection."
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
              {hasSelectedPeriod ? (
                <ReferenceLine
                  x={selectedPeriodLabel ?? undefined}
                  stroke={CHART.forest}
                  strokeDasharray="4 4"
                  label={{ value: "Selected", position: "insideTopRight", fill: CHART.forest, fontSize: 10 }}
                />
              ) : null}
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
                name={isWeightedYield ? "Yield (t/ha, weighted)" : "Yield (t/ha)"}
                stroke={CHART.amber}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Source: {data?.source_id ?? "NISR SAS canonical productivity panel"} · one period axis
        (2022A-2026B), never a mix of releases. {data?.method ?? ""} A period the release did not
        tabulate is left as a gap, not interpolated.
      </SourceNote>
    </Card>
  );
}
