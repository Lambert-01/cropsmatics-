"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { fmtNumber } from "@/lib/format";
import type { ProductivityResponse } from "@/types";

import { buildDistrictChange, changeSummary, type ChangeDirection, type DistrictChangeRow } from "./change";

/** Districts drawn as lines before the tail is left to the mover list below. */
const MAX_LINES = 8;

const DIRECTION_STYLE: Record<ChangeDirection, { label: string; color: string; text: string }> = {
  improved: { label: "Improved", color: CHART.green, text: "text-success" },
  declined: { label: "Declined", color: CHART.red, text: "text-danger" },
  flat: { label: "No meaningful change", color: CHART.axis, text: "text-slate-500" },
  insufficient: { label: "Insufficient data", color: CHART.axis, text: "text-slate-400" },
};

/** Largest movers first, so the lines that matter are the ones drawn. */
function topMovers(rows: readonly DistrictChangeRow[], limit: number): DistrictChangeRow[] {
  return rows
    .filter((row) => row.direction !== "insufficient" && row.deltaPct !== null)
    .sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0))
    .slice(0, limit);
}

/**
 * Two-period district change (view D).
 *
 * A slope chart: one line per district from its observed yield in the earlier
 * period to its observed yield in the later period. It answers "which districts
 * improved or worsened between these two releases?" and nothing more — it is a
 * change between two published observations, not a trend fit, not a forecast,
 * and not a causal claim.
 *
 * Direction is carried three ways: line colour, an explicit label per district
 * in the mover list, and the signed percentage. A district missing either period
 * is never drawn and is reported as "insufficient data" rather than collapsing
 * to a flat line at zero.
 */
export function DistrictChangeSlope({
  fromData,
  toData,
  fromLabel,
  toLabel,
  crop,
  isLoading,
}: {
  fromData?: ProductivityResponse;
  toData?: ProductivityResponse;
  fromLabel: string;
  toLabel: string;
  crop?: string;
  isLoading?: boolean;
}) {
  const motion = useChartMotion();

  const { lines, summary, chartData } = useMemo(() => {
    const built = buildDistrictChange(fromData?.rows ?? [], toData?.rows ?? []);
    const movers = topMovers(built, MAX_LINES);
    return {
      lines: movers,
      summary: changeSummary(built),
      chartData: [
        {
          period: fromLabel,
          ...Object.fromEntries(movers.map((row) => [row.district, row.fromYieldKgHa])),
        },
        {
          period: toLabel,
          ...Object.fromEntries(movers.map((row) => [row.district, row.toYieldKgHa])),
        },
      ],
    };
  }, [fromData, toData, fromLabel, toLabel]);

  const loaded = Boolean(fromData && toData);
  const samePeriod = fromLabel === toLabel;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="District change between two periods"
        subtitle="Which districts improved or worsened between the two selected releases"
      />
      {isLoading && !loaded ? (
        <TableSkeleton rows={6} />
      ) : samePeriod ? (
        <div className="p-4">
          <EmptyState
            title="Select two different periods to compare."
            hint="This view compares a district's observed yield in an earlier release with a later one. The same period is selected on both sides, so nothing can be compared."
          />
        </div>
      ) : summary.comparable === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No district has a published yield in both periods."
            hint="A change needs an observed yield in each period for the same crop. Nothing is inferred for districts published in only one."
          />
        </div>
      ) : (
        <ChartBody
          chartData={chartData}
          lines={lines}
          summary={summary}
          fromLabel={fromLabel}
          toLabel={toLabel}
          crop={crop}
          motion={motion}
        />
      )}
      <SourceNote>{sourceNote(summary, fromLabel, toLabel)}</SourceNote>
    </Card>
  );
}

function sourceNote(
  summary: ReturnType<typeof changeSummary>,
  fromLabel: string,
  toLabel: string,
): string {
  const compare =
    summary.comparable > 0
      ? ` ${summary.improved} improved, ${summary.declined} declined, ${summary.flat} with no meaningful change`
      : "";
  const skipped =
    summary.insufficient > 0
      ? `; ${summary.insufficient} district${summary.insufficient === 1 ? "" : "s"} published in only one period and not compared`
      : "";
  return `Compared across ${fromLabel || "—"} and ${toLabel || "—"}.${compare}${skipped}. Yield in kg/ha, observed. A movement under the flat threshold is not reported as an improvement, and no district's change is inferred from a neighbouring period.`;
}

function ChartBody({
  chartData,
  lines,
  summary,
  fromLabel,
  toLabel,
  crop,
  motion,
}: {
  chartData: Record<string, string | number | null>[];
  lines: DistrictChangeRow[];
  summary: ReturnType<typeof changeSummary>;
  fromLabel: string;
  toLabel: string;
  crop?: string;
  motion: { isAnimationActive: boolean };
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-3 text-[11px] text-slate-500">
        <span>
          <span className="font-semibold text-slate-600">Crop:</span> {crop ?? "All crops"}
        </span>
        <span className="text-slate-300" aria-hidden="true">
          ·
        </span>
        <span>
          Direction: <span className="text-success">up</span> is a higher observed yield than the
          earlier period, <span className="text-danger">down</span> is lower. A change between two
          observed releases — not a forecast and not a cause.
        </span>
      </div>

      <div
        className="px-2 pt-3"
        style={{ height: 280 }}
        role="img"
        aria-label={`Slope chart of district yield change. ${summary.improved} improved, ${summary.declined} declined, ${summary.flat} with no meaningful change, ${summary.insufficient} without comparable data.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 96, bottom: 8, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="period" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => fmtNumber(v, 0)} width={48} />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, name) => [`${fmtNumber(Number(value), 0)} kg/ha`, String(name)]}
            />
            {lines.map((row) => (
              <Line
                key={row.district}
                {...motion}
                type="monotone"
                dataKey={row.district}
                stroke={DIRECTION_STYLE[row.direction].color}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 grid gap-1 px-4 pb-2 text-[12px] sm:grid-cols-2">
        {lines.map((row) => (
          <li key={row.district} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-slate-700">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: DIRECTION_STYLE[row.direction].color }}
                aria-hidden="true"
              />
              {row.district}
            </span>
            <span className={`font-medium tabular-nums ${DIRECTION_STYLE[row.direction].text}`}>
              {DIRECTION_STYLE[row.direction].label}
              {row.deltaPct !== null ? ` · ${row.deltaPct > 0 ? "+" : ""}${fmtNumber(row.deltaPct, 1)}%` : ""}
            </span>
          </li>
        ))}
      </ul>
      <span className="sr-only">{`From ${fromLabel} to ${toLabel}`}</span>
    </>
  );
}

