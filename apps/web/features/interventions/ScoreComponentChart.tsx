"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import type { PriorityRow } from "@/types";

const SERIES = [
  { key: "gap", label: "Gap", color: CHART.red },
  { key: "vulnerability", label: "Vulnerability", color: CHART.amber },
  { key: "affected_scale", label: "Affected scale", color: CHART.blue },
  { key: "readiness", label: "Readiness", color: CHART.primary },
];

/**
 * The component series actually present in the rows.
 *
 * A component with no measured value for the selected period arrives as `null`,
 * and there is no honest bar to draw for it: charting it as 0 would read as
 * "scored nothing" instead of "not measured". The series is therefore dropped and
 * named underneath instead.
 */
export function ScoreComponentChart({ rows }: { rows: PriorityRow[] }) {
  const data = rows.slice(0, 10).map((r) => ({
    name: `${r.district}`,
    crop: r.crop,
    gap: r.gap,
    vulnerability: r.vulnerability,
    affected_scale: r.affected_scale,
    readiness: r.readiness,
  }));
  const active = SERIES.filter((series) =>
    data.some((row) => row[series.key as keyof typeof row] != null),
  );
  const dropped = SERIES.filter((series) => !active.includes(series));

  return (
    <Card>
      <CardHeader
        title="Score components"
        subtitle="Why the top observations rank where they do (normalised contributions)"
      />
      {data.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="h-[300px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" {...AXIS_PROPS} interval={0} angle={-30} textAnchor="end" height={70} />
              <YAxis domain={[0, 1]} {...AXIS_PROPS} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {active.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <SourceNote>
        Components are normalised to [0, 1] across the candidate set by the Python engine. Cost
        constraint is subtracted and not shown as a positive stack.
        {dropped.length
          ? ` ${dropped
              .map((series) => series.label)
              .join(" and ")} ${dropped.length === 1 ? "is" : "are"} not charted: no measured value exists for this period, so the weight was redistributed instead of being plotted as zero.`
          : ""}
      </SourceNote>
    </Card>
  );
}
