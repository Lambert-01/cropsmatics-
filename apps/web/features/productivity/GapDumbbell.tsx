"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { AXIS_PROPS, CHART, useChartMotion } from "@/features/dashboard/chartTheme";
import { fmtNumber, periodLabel } from "@/lib/format";
import {
  dumbbellEndpoints,
  dumbbellRows,
  exclusionCounts,
  toDistrictGapRows,
  type DumbbellRow,
  type ProductivityRow,
} from "./gap";
import { GapSemantics } from "./GapSemantics";

const DEFAULT_LIMIT = 12;
const ROW_HEIGHT = 26;

/**
 * The dumbbell: one connector per district, from its benchmark to its observed
 * yield.
 *
 * Recharts has no dumbbell series, so this is a *range* bar — a Bar whose value
 * is a two-element `[low, high]` array — with a custom shape that draws the
 * connector and the two endpoints instead of a filled rectangle. That keeps a
 * real numeric axis, which is what the dense matrix lacked, without hand-rolling
 * a chart or adding a dependency.
 *
 * A district missing either end is not drawn at all: a dumbbell with one end
 * would imply a comparison the published data do not support.
 */
function DumbbellShape(props: BarShapeProps) {
  const { x, y, width, height, payload } = props;
  const datum = payload as DumbbellRow | undefined;
  // Zero width means benchmark and observed are equal, so there is no connector.
  if (!datum || typeof x !== "number" || typeof y !== "number" || !(width > 0)) return null;

  const cy = y + height / 2;
  const { benchmarkX, observedX } = dumbbellEndpoints({ x, width, benchmarkIsLower: datum.benchmarkIsLower });

  return (
    <g>
      <line
        x1={x}
        y1={cy}
        x2={x + width}
        y2={cy}
        stroke={CHART.grid}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={benchmarkX} cy={cy} r={4.5} fill={CHART.blue} />
      <circle cx={observedX} cy={cy} r={4.5} fill={CHART.primary} />
    </g>
  );
}

/**
 * Names both ends of the connector.
 *
 * The default tooltip would only report the range bar's own `[low, high]` value,
 * which shows the distance but not which end is the benchmark. Reading the datum
 * keeps the two published columns distinct, and reports the gap index as the
 * API published it — including its absence.
 */
function DumbbellTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: DumbbellRow }[];
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-forest/10 bg-surface px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-forest">{row.district}</p>
      <dl className="mt-1 space-y-0.5 tabular-nums text-slate-600">
        <div className="flex justify-between gap-4">
          <dt>Benchmark</dt>
          <dd>{fmtNumber(row.benchmarkKgHa, 0)} kg/ha</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Observed</dt>
          <dd>{fmtNumber(row.yieldKgHa, 0)} kg/ha</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Gap index</dt>
          <dd>{row.gapIndex === null ? "—" : `${fmtNumber(row.gapIndex, 1)}%`}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Colour + text, never colour alone. */
function DumbbellLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 pt-2 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: CHART.blue }}
          aria-hidden="true"
        />
        Benchmark
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: CHART.primary }}
          aria-hidden="true"
        />
        Observed yield
      </span>
      <span>Connector reaching left of the benchmark = below it</span>
    </div>
  );
}

export function GapDumbbell({
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

  const { points, domain, withComparison, missing } = useMemo(() => {
    const parsed = toDistrictGapRows(rows);
    const plotted = dumbbellRows(parsed, limit);
    const counts = exclusionCounts(parsed);

    // Pad the axis so neither endpoint sits on the frame. Computed from the
    // plotted data rather than passed as a Recharts domain expression, so the
    // value stays a number the tooltip and axis agree on.
    const values = plotted.flatMap((row) => [row.yieldKgHa, row.benchmarkKgHa]);
    const low = values.length ? Math.min(...values) : 0;
    const high = values.length ? Math.max(...values) : 1;
    const pad = Math.max((high - low) * 0.08, 50);

    return {
      points: plotted,
      domain: [Math.max(0, low - pad), high + pad] satisfies [number, number],
      withComparison: counts.withComparison,
      missing: counts.total,
    };
  }, [rows, limit]);

  if (isLoading) return <TableSkeleton rows={8} />;

  const height = Math.max(220, points.length * ROW_HEIGHT + 48);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Observed vs benchmark yield"
        subtitle="One connector per district, benchmark to observed — a joined pair is a real comparison, not an average"
      />

      <GapSemantics
        period={period}
        benchmark={benchmark}
        metric="Observed yield against benchmark yield"
        unit="kg/ha"
      />

      {points.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No district has both an observed and a benchmark yield here."
            hint="This view needs both published columns; a district missing either is left out rather than drawn partially."
          />
        </div>
      ) : (
        <>
          <DumbbellLegend />
          <div
            className="px-2 pt-1"
            style={{ height }}
            role="img"
            aria-label={`Observed against benchmark yield in kilograms per hectare for ${points.length} districts, ${periodLabel(period)}. Districts are ordered by how far below the benchmark they sit; a connector reaching left means the district is below its benchmark.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={points}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 0 }}
              >
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis
                  type="number"
                  {...AXIS_PROPS}
                  domain={domain}
                  tickFormatter={(v: number) => fmtNumber(v, 0)}
                />
                <YAxis type="category" dataKey="district" width={116} {...AXIS_PROPS} />
                <Tooltip content={<DumbbellTooltip />} />
                <Bar
                  {...motion}
                  dataKey="range"
                  name="Benchmark to observed yield"
                  shape={DumbbellShape}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <SourceNote>
        {points.length} of {withComparison} districts with a published comparison shown, from{" "}
        {missing} in this selection; ordered by shortfall against the benchmark. Observed yield and
        benchmark are the panel&apos;s own columns, in kg/ha. A district with no benchmark is
        genuinely absent from this chart — no benchmark is imputed for it.
      </SourceNote>
    </Card>
  );
}
