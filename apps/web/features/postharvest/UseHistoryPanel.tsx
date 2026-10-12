"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardBody, CardHeader, SourceNote } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { ChartSkeleton, EmptyState, ErrorState, UpdatingPill } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { chartDisplayState, isUpdating as showUpdating } from "@/lib/chartState";
import { fmtPct, periodLabel } from "@/lib/format";
import {
  availableIndicators,
  compositionFor,
  cropRanking,
  indicatorSeries,
  phIndicatorLabel,
  shareFlag,
  sortPeriods,
} from "@/lib/postharvestHistory";
import type { PostharvestHistoryResponse } from "@/types";

type ViewId = "composition" | "history" | "compare";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "composition", label: "Use composition" },
  { id: "history", label: "Over time" },
  { id: "compare", label: "Crop comparison" },
];

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-lg border border-forest/15 bg-white px-2 text-sm text-slate-700 outline-none focus-visible:border-primary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Historical post-harvest use: how a crop's production was actually used, by
 * release, straight from `GET /analytics/postharvest-history`.
 *
 * The panel is one request (`usePostharvestHistory`) with the crop, release and
 * indicator chosen here and applied client-side, so every chart below re-renders
 * from the same snapshot - a slower request can never overwrite a fresher one.
 *
 * Published shares are used as published. Where a crop x release group does not
 * total 100 within the rounding tolerance the group is flagged rather than
 * rescaled, and a value that was never published is shown as "no data", never
 * as 0%.
 */
export function UseHistoryPanel({
  data,
  isLoading,
  isFetching,
  hasError,
  errorMessage,
  onRetry,
  initialCrop,
}: {
  data?: PostharvestHistoryResponse;
  isLoading?: boolean;
  isFetching?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Crop the page's global filter selected, used as the panel's starting point. */
  initialCrop?: string;
}) {
  const motion = useChartMotion();
  const [view, setView] = useState<ViewId>("composition");
  const [cropState, setCropState] = useState<string | null>(null);
  const [periodState, setPeriodState] = useState<string | null>(null);
  const [indicatorState, setIndicatorState] = useState<string | null>(null);

  const observations = useMemo(() => data?.observations ?? [], [data]);
  const crops = useMemo(() => [...(data?.crops ?? [])], [data]);
  const periods = useMemo(() => sortPeriods(data?.periods ?? []), [data]);
  const indicators = useMemo(() => availableIndicators(observations), [observations]);

  const crop = cropState ?? (initialCrop && crops.includes(initialCrop) ? initialCrop : crops[0] ?? "");
  const period = periodState ?? (data?.period ?? periods[periods.length - 1] ?? "");
  const indicator =
    indicatorState ??
    (indicators.includes("sold_pct") ? "sold_pct" : indicators[0] ?? "");

  const updating = showUpdating({ hasData: observations.length > 0, isFetching });
  const state = chartDisplayState({
    hasData: observations.length > 0,
    isLoading,
    hasError,
  });

  const composition = useMemo(
    () => (crop && period ? compositionFor(observations, crop, period) : []),
    [observations, crop, period],
  );
  const series = useMemo(
    () => (crop && indicator ? indicatorSeries(observations, crop, indicator, periods) : []),
    [observations, crop, indicator, periods],
  );
  const ranking = useMemo(
    () => (period && indicator ? cropRanking(observations, period, indicator) : []),
    [observations, period, indicator],
  );
  const flag = useMemo(
    () => (crop && period ? shareFlag(data?.share_totals ?? [], crop, period) : null),
    [data, crop, period],
  );

  if (state === "loading") return <ChartSkeleton />;
  if (state === "error") {
    return (
      <Card>
        <CardHeader
          title="How production was used"
          subtitle="Published use shares by crop and release"
        />
        <div className="p-4">
          <ErrorState message={errorMessage} onRetry={onRetry} />
        </div>
      </Card>
    );
  }

  const flaggedGroups = data?.shares_off_total ?? 0;
  const totalGroups = data?.share_totals?.length ?? 0;

  return (
    <Card>
      <CardHeader
        title="How production was used"
        subtitle={
          data
            ? `${periodLabel(periods[0])}–${periodLabel(periods[periods.length - 1])} · ${crops.length} crops · ${data.n_observations.toLocaleString("en-US")} published observations`
            : "Published use shares by crop and release"
        }
        action={<UpdatingPill active={updating} />}
      />

      {data && !data.available ? (
        <div className="p-4">
          <EmptyState
            title="No historical use shares are published."
            hint={data.note ?? "The post-harvest use panel has no rows for this selection."}
          />
        </div>
      ) : !data || observations.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No published use shares for this selection."
            hint="Try another crop or release. Empty means nothing was published - it never means 0%."
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 px-4 pt-3">
            <Select
              label="Crop"
              value={crop}
              onChange={setCropState}
              options={crops.map((name) => ({ value: name, label: name }))}
            />
            <Select
              label="Release"
              value={period}
              onChange={setPeriodState}
              options={periods.map((code) => ({ value: code, label: periodLabel(code) }))}
            />
            <Select
              label="Indicator"
              value={indicator}
              onChange={setIndicatorState}
              options={indicators.map((code) => ({ value: code, label: phIndicatorLabel(code) }))}
            />
            <Tabs
              items={VIEWS}
              active={view}
              onChange={(next) => setView(next as ViewId)}
              ariaLabel="Post-harvest use view"
              className="ml-auto self-center"
            />
          </div>

          <CardBody className="pt-2">
            {view === "composition" ? (
              composition.length === 0 ? (
                <EmptyState
                  title={`No published use shares for ${crop} in ${periodLabel(period)}.`}
                  hint="Nothing was published for this group. The shares are not zero - they are absent."
                />
              ) : (
                <>
                  <p className="sr-only">
                    {crop}, {periodLabel(period)}:{" "}
                    {composition.map((row) => `${row.label} ${fmtPct(row.value)}`).join(", ")}.
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(220, composition.length * 30 + 40)}>
                    <BarChart
                      data={composition}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid stroke={CHART.grid} horizontal={false} />
                      <XAxis type="number" unit="%" {...AXIS_PROPS} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={132}
                        {...AXIS_PROPS}
                      />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value) => [fmtPct(Number(value)), "Share of use"]}
                      />
                      <Bar
                        dataKey="value"
                        fill={CHART.primary}
                        radius={[0, 6, 6, 0]}
                        {...motion}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )
            ) : null}

            {view === "history" ? (
              series.length === 0 ? (
                <EmptyState
                  title={`No published series for ${phIndicatorLabel(indicator)}.`}
                  hint="Nothing was published for this crop. The chart is left empty rather than filled with zeros."
                />
              ) : (
                <>
                  <p className="sr-only">
                    {phIndicatorLabel(indicator)} for {crop}:{" "}
                    {series
                      .map((point) => `${periodLabel(point.period)} ${point.value === null ? "no data" : fmtPct(point.value)}`)
                      .join(", ")}
                    .
                  </p>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={CHART.grid} />
                      <XAxis dataKey="period" tickFormatter={periodLabel} {...AXIS_PROPS} />
                      <YAxis unit="%" {...AXIS_PROPS} />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        labelFormatter={(label) => periodLabel(String(label))}
                        formatter={(value) => [fmtPct(Number(value)), phIndicatorLabel(indicator)]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={phIndicatorLabel(indicator)}
                        stroke={CHART.primary}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: CHART.primary }}
                        connectNulls={false}
                        {...motion}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )
            ) : null}

            {view === "compare" ? (
              ranking.length === 0 ? (
                <EmptyState
                  title={`No published ${phIndicatorLabel(indicator)} for ${periodLabel(period)}.`}
                  hint="No crop reported this indicator for the selected release. Crops with no data are omitted, never shown as 0%."
                />
              ) : (
                <>
                  <p className="sr-only">
                    {phIndicatorLabel(indicator)} across {ranking.length} crops in{" "}
                    {periodLabel(period)}: highest {ranking[0].crop} {fmtPct(ranking[0].value)}.
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(220, ranking.length * 28 + 40)}>
                    <BarChart
                      data={ranking}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid stroke={CHART.grid} horizontal={false} />
                      <XAxis type="number" unit="%" {...AXIS_PROPS} />
                      <YAxis type="category" dataKey="crop" width={120} {...AXIS_PROPS} />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value) => [fmtPct(Number(value)), phIndicatorLabel(indicator)]}
                      />
                      <Bar
                        dataKey="value"
                        fill={CHART.blue}
                        radius={[0, 6, 6, 0]}
                        {...motion}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {flag ? (
                flag.shares_sum_ok ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                    Shares total {fmtPct(flag.shares_sum_pct)} · within tolerance
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">
                    Shares total {fmtPct(flag.shares_sum_pct)} · flagged, published as-is
                  </span>
                )
              ) : null}
              <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                {flaggedGroups} of {totalGroups} crop-release groups flagged panel-wide
              </span>
            </div>

            <SourceNote>
              {data?.note ?? "Published shares of a crop's total use."}
              {data?.provenance?.source_id ? ` Source: ${data.provenance.source_id}.` : ""}
              {data?.provenance?.limitations?.length
                ? ` Limitation: ${data.provenance.limitations.join("; ")}.`
                : ""}
            </SourceNote>
          </CardBody>
        </>
      )}
    </Card>
  );
}
