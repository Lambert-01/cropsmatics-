"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardBody, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState, ErrorState, UpdatingPill } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { chartDisplayState, isUpdating as showUpdating } from "@/lib/chartState";
import { fmtPct, periodLabel } from "@/lib/format";
import type { PracticeIndicatorResponse } from "@/types";

const DOMAIN_LABELS: Record<string, string> = {
  practices: "Agricultural practices",
  irrigation: "Irrigation",
  water_source: "Water sources",
  erosion_control: "Erosion control",
  erosion_severity: "Erosion severity",
};

const INDICATOR_LABELS: Record<string, string> = {
  improved_seed_pct: "Improved seed",
  inorganic_fertilizer_pct: "Inorganic fertiliser",
  organic_fertilizer_pct: "Organic fertiliser",
  pesticide_pct: "Pesticide",
  irrigation_pct: "Irrigation",
  anti_erosion_pct: "Erosion protection",
  agroforestry_pct: "Agroforestry",
  mechanization_pct: "Mechanisation",
};

function indicatorLabel(code: string) {
  return INDICATOR_LABELS[code] ?? code.replace(/_pct$/, "").replace(/_/g, " ");
}

const SERIES_COLORS = [
  CHART.primary,
  CHART.blue,
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

/**
 * Multi-period practice indicator trends.
 *
 * Shows how agricultural practice adoption has changed across published
 * releases. Each indicator is one line; the domain selector keeps the chart
 * readable by limiting to one domain at a time.
 *
 * Published values are used as published. A null means not published — it is
 * never shown as 0% and never interpolated across a gap.
 */
export function PracticeIndicatorsPanel({
  data,
  isLoading,
  isFetching,
  hasError,
  errorMessage,
  onRetry,
}: {
  data?: PracticeIndicatorResponse;
  isLoading?: boolean;
  isFetching?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const motion = useChartMotion();
  const [domain, setDomain] = useState<string>("");

  const observations = useMemo(() => data?.observations ?? [], [data]);
  const domains = useMemo(() => data?.domains ?? [], [data]);
  const periods = useMemo(() => {
    const seen = new Set<string>();
    observations.forEach((o) => seen.add(o.period_code));
    return Array.from(seen).sort();
  }, [observations]);

  const activeDomain = domain || domains[0] || "";

  // Build one series per indicator in the active domain.
  const series = useMemo(() => {
    const domainObs = observations.filter(
      (o) => !activeDomain || o.domain === activeDomain,
    );
    const indicatorCodes = Array.from(new Set(domainObs.map((o) => o.indicator_code)));

    return indicatorCodes.map((code, idx) => ({
      code,
      label: indicatorLabel(code),
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
      points: periods.map((p) => {
        const obs = domainObs.find(
          (o) => o.indicator_code === code && o.period_code === p,
        );
        return { period: p, value: obs?.value ?? null };
      }),
    }));
  }, [observations, activeDomain, periods]);

  // Recharts needs one row per period with all indicator values.
  const chartData = useMemo(
    () =>
      periods.map((p) => {
        const row: Record<string, string | number | null> = { period: p };
        series.forEach((s) => {
          const pt = s.points.find((pt) => pt.period === p);
          row[s.code] = pt?.value ?? null;
        });
        return row;
      }),
    [periods, series],
  );

  const updating = showUpdating({ hasData: observations.length > 0, isFetching });
  const state = chartDisplayState({ hasData: observations.length > 0, isLoading, hasError });

  if (state === "loading") return <ChartSkeleton />;
  if (state === "error") {
    return (
      <Card>
        <CardHeader title="Practice adoption trends" subtitle="Multi-period agricultural practice indicators" />
        <div className="p-4">
          <ErrorState message={errorMessage} onRetry={onRetry} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Practice adoption trends"
        subtitle={
          data
            ? `${periods.length} published releases · ${data.n_observations.toLocaleString("en-US")} observations`
            : "Multi-period agricultural practice indicators"
        }
        action={<UpdatingPill active={updating} />}
      />

      {!data || observations.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No practice indicator data for this selection."
            hint="Try a different district or period."
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 px-4 pt-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Domain
              </span>
              <select
                value={activeDomain}
                onChange={(e) => setDomain(e.target.value)}
                className="h-9 rounded-lg border border-forest/15 bg-white px-2 text-sm text-slate-700 outline-none focus-visible:border-primary"
              >
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABELS[d] ?? d}
                  </option>
                ))}
              </select>
            </label>
            <p className="pb-1 text-[11px] text-slate-500">
              {DOMAIN_LABELS[activeDomain] ?? activeDomain} ·{" "}
              {series.length} indicator{series.length !== 1 ? "s" : ""}
            </p>
          </div>

          <CardBody className="pt-2">
            {series.length === 0 ? (
              <EmptyState
                title="No indicators published for this domain."
                hint="Select a different domain."
              />
            ) : (
              <>
                <p className="sr-only">
                  {DOMAIN_LABELS[activeDomain]} across {periods.length} releases:{" "}
                  {series.map((s) => s.label).join(", ")}.
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={CHART.grid} />
                    <XAxis dataKey="period" tickFormatter={periodLabel} {...AXIS_PROPS} />
                    <YAxis unit="%" domain={[0, 100]} {...AXIS_PROPS} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      labelFormatter={(label) => periodLabel(String(label))}
                      formatter={(value, name) => [
                        value === null ? "no data" : fmtPct(Number(value)),
                        indicatorLabel(String(name)),
                      ]}
                    />
                    {series.map((s) => (
                      <Line
                        key={s.code}
                        type="monotone"
                        dataKey={s.code}
                        name={s.code}
                        stroke={s.color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: s.color }}
                        connectNulls={false}
                        {...motion}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {series.map((s) => (
                    <span key={s.code} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span
                        className="inline-block h-2 w-4 rounded-full"
                        style={{ backgroundColor: s.color }}
                        aria-hidden="true"
                      />
                      {s.label}
                    </span>
                  ))}
                </div>
              </>
            )}

            <SourceNote>
              {data?.note ?? "Published practice adoption shares from NISR SAS district surveys."}
              {data?.provenance?.source_id ? ` Source: ${data.provenance.source_id}.` : ""}
              {" "}A null value means the indicator was not published for that release — it is never
              shown as 0%.
            </SourceNote>
          </CardBody>
        </>
      )}
    </Card>
  );
}
