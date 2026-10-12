"use client";

import { useEffect, useMemo, useState } from "react";
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
import { NationalContextBadge } from "@/components/ui/NationalContextBadge";
import { ChartSkeleton, EmptyState, ErrorState, UpdatingPill } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { chartDisplayState, isUpdating as showUpdating } from "@/lib/chartState";
import { cn } from "@/lib/cn";
import { periodLabel } from "@/lib/format";
import {
  availableSeriesKeys,
  defaultSeriesKeys,
  seriesLabelText,
  toggleSeriesKey,
} from "@/lib/series";
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
  isFetching,
  hasError,
  errorMessage,
  onRetry,
}: {
  data?: TrendResponse;
  isLoading?: boolean;
  /** A newer response is in flight for the same scope while `data` is still valid. */
  isFetching?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const motion = useChartMotion();

  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        period: periodLabel(p.period),
        ...p.values,
      })),
    [data],
  );

  const published = useMemo(() => availableSeriesKeys(SERIES, points), [points]);
  const [visible, setVisible] = useState<string[]>(() => defaultSeriesKeys(SERIES, []));

  // Default to a readable subset once the data arrive, and drop a selection for a
  // series the source stops publishing rather than leaving an empty line.
  useEffect(() => {
    setVisible((current) => {
      const stillPublished = current.filter((key) => published.includes(key));
      if (stillPublished.length > 0) return stillPublished;
      return defaultSeriesKeys(SERIES, points);
    });
  }, [published, points]);

  const shown = SERIES.filter((spec) => visible.includes(spec.key));
  const hidden = SERIES.filter((spec) => published.includes(spec.key) && !visible.includes(spec.key));

  // National adoption is a multi-period national series, so it is never re-keyed
  // by a period selection. Once loaded it must stay on screen through any
  // background refetch rather than collapse to a placeholder.
  const state = chartDisplayState({ hasData: points.length > 0, isLoading, hasError });
  const updating = showUpdating({ hasData: points.length > 0, isFetching });
  if (state === "loading") return <ChartSkeleton />;
  if (state === "error") {
    return (
      <Card>
        <CardHeader
          title="Input & practice adoption"
          subtitle="The national practice series could not be loaded"
        />
        <div className="p-4">
          <ErrorState message={errorMessage} onRetry={onRetry} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Input & practice adoption"
        subtitle={`Share of farmers reporting each practice, by published period (national series). Showing ${seriesLabelText(
          visible,
          SERIES,
        )}`}
        action={
          <div className="flex items-center gap-2">
            <NationalContextBadge note="crop & district filters not applicable" />
            <UpdatingPill active={updating} />
          </div>
        }
      />
      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No national practice series are published for this catalogue."
            hint="The input/practice trend table is national and multi-period. Refresh the catalogue if it should be present."
          />
        </div>
      ) : (
        <>
          {/* Series chips instead of a six-entry legend: the reader chooses how
              many lines to carry, and the default is three. */}
          <div className="flex flex-wrap gap-1.5 px-4 pt-3" role="group" aria-label="Practice series">
            {[...shown, ...hidden].map((spec) => {
              const active = visible.includes(spec.key);
              return (
                <button
                  key={spec.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setVisible((current) => toggleSeriesKey(current, spec.key))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition",
                    active
                      ? "border-forest/25 bg-white font-medium text-slate-700"
                      : "border-dashed border-forest/20 text-slate-400 hover:text-slate-600",
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: active ? spec.color : "transparent", borderColor: spec.color }}
                    aria-hidden="true"
                  />
                  {spec.label}
                </button>
              );
            })}
          </div>
          <div className="h-[260px] px-2 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="period" {...AXIS_PROPS} />
                <YAxis
                  {...AXIS_PROPS}
                  domain={[0, 100]}
                  tickFormatter={(value: number) => `${value}%`}
                  label={{
                    value: "% of farmers reporting",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 10, fill: "#64748b" },
                  }}
                />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {shown.map((s) => (
                  <Line
                    {...motion}
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
        </>
      )}
      <SourceNote>
        Source: {data?.provenance.source_id ?? "NISR input/practice trend table"}. Series begin in
        different periods; a missing point is shown as absent, never as zero.
      </SourceNote>
    </Card>
  );
}
