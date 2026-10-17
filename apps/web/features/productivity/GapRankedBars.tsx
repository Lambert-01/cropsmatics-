"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE, useChartMotion } from "@/features/dashboard/chartTheme";
import { makeScale } from "@/features/maps/colors";
import { fmtNumber, periodLabel } from "@/lib/format";
import {
  exclusionCounts,
  gapScaleDomain,
  rankedByGap,
  toDistrictGapRows,
  type ProductivityRow,
} from "./gap";
import { GapSemantics } from "./GapSemantics";

/** Districts shown before the tail is left to the full ranking table. */
const DEFAULT_LIMIT = 12;
/** Vertical room per district, so bars never compress into a smear. */
const ROW_HEIGHT = 26;

/**
 * Ranked district gap (view A).
 *
 * A horizontal bar per district, longest first, answering "who is furthest below
 * their benchmark" — a question a district × crop matrix cannot answer, because
 * a matrix gives every cell equal visual weight and forces the reader to scan
 * 30 rows to find the extremes.
 *
 * Bar length carries the magnitude, the value is printed at the end of every
 * bar, and the colour repeats the same ordering on the map's scale. Three
 * encodings of one number, so nothing depends on colour alone.
 */
export function GapRankedBars({
  rows,
  isLoading,
  period,
  benchmark,
  limit = DEFAULT_LIMIT,
}: {
  rows: readonly ProductivityRow[];
  isLoading?: boolean;
  period?: string | null;
  benchmark?: string | null;
  limit?: number;
}) {
  const motion = useChartMotion();

  const { points, scale, ranked, unpublished, beyondLimit } = useMemo(() => {
    const parsed = toDistrictGapRows(rows);
    const rankedRows = rankedByGap(parsed, limit);
    const counts = exclusionCounts(parsed);
    // The domain spans every published gap, not just the displayed slice, so a
    // district's colour never shifts because a neighbour was cut by the limit.
    const domain = gapScaleDomain(parsed);
    // A signed gap against a real zero (the benchmark) is a diverging quantity: the
    // district at or above its benchmark is not "slightly less red" than the worst
    // district, it is on the other side of zero. Passing the kind explicitly keeps
    // this in step with the map, which reads the same kind from METRIC_SEMANTICS.
    const colourScale = makeScale(domain.min, domain.max, "diverging", parsed.map((r) => r.gapIndex));
    return {
      points: rankedRows.map((row) => ({
        district: row.district,
        gapIndex: row.gapIndex,
        color: colourScale.color(row.gapIndex),
      })),
      scale: colourScale,
      ranked: rankedRows.length,
      unpublished: counts.total - counts.withGap,
      beyondLimit: counts.withGap - rankedRows.length,
    };
  }, [rows, limit]);

  if (isLoading) return <TableSkeleton rows={8} />;

  const height = Math.max(220, points.length * ROW_HEIGHT + 72);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="District ranking by yield gap"
        subtitle={`The ${limit} widest shortfalls against the benchmark — longest bar is furthest below`}
      />

      <GapSemantics period={period} benchmark={benchmark} />

      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No district gap could be ranked for this selection."
            hint="A ranking needs at least one district with a published yield and a benchmark for the selected crop."
          />
        </div>
      ) : (
        <>
          <div
            className="px-2 pt-3"
            style={{ height }}
            role="img"
            aria-label={`Ranked yield gap index for ${ranked} districts, ${periodLabel(period)}. Longest bar is furthest below the benchmark and higher is worse.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={points}
                layout="vertical"
                margin={{ top: 4, right: 44, bottom: 4, left: 0 }}
              >
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...AXIS_PROPS} tickFormatter={(v: number) => fmtNumber(v, 0)} />
                <YAxis type="category" dataKey="district" width={116} {...AXIS_PROPS} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value) => [`${fmtNumber(Number(value), 1)}%`, "Yield gap index"]}
                />
                <Bar
                  {...motion}
                  dataKey="gapIndex"
                  name="Yield gap index (%)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={16}
                >
                  {points.map((point) => (
                    <Cell key={point.district} fill={point.color} />
                  ))}
                  <LabelList
                    dataKey="gapIndex"
                    position="right"
                    fill={CHART.axis}
                    fontSize={11}
                    formatter={(value: unknown) => `${fmtNumber(Number(value), 0)}%`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 pb-1 pt-2 text-[11px] text-slate-500">
            <span>{fmtNumber(scale.min, 0)}%</span>
            <span
              className="h-2.5 w-40 rounded-full"
              style={{ background: `linear-gradient(to right, ${scale.stops.join(", ")})` }}
              aria-hidden="true"
            />
            <span>{fmtNumber(scale.max, 0)}%</span>
            <span className="ml-2">
              same scale as the district map — red is a wider gap, green is at or above benchmark
              {scale.min <= 0 && scale.max >= 0 ? ", and 0 is the benchmark" : ", and every ranked district sits below the benchmark"}
            </span>
          </div>
        </>
      )}

      <SourceNote>
        {ranked} district{ranked === 1 ? "" : "s"} ranked
        {beyondLimit > 0 ? `, ${beyondLimit} further down the ranking not shown` : ""}
        {unpublished > 0
          ? `, ${unpublished} with no published gap index for this selection`
          : ""}
        . Observed yield, benchmark and gap index are the panel's own published columns — the gap is
        never recomputed here. Gap index is measured against the selected benchmark strategy, so
        changing that strategy changes this ranking.
      </SourceNote>
    </Card>
  );
}
