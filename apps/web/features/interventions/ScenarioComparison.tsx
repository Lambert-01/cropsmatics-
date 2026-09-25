"use client";

import { ArrowDownRight, ArrowUpRight, GitCompareArrows } from "lucide-react";
import { useMemo } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { fmtNumber } from "@/lib/format";
import type { PriorityRow } from "@/types";

/** Compares two API results (baseline vs user-adjusted weights). */
export function ScenarioComparison({
  baseline,
  adjusted,
}: {
  baseline: PriorityRow[];
  adjusted: PriorityRow[] | null;
}) {
  const movers = useMemo(() => {
    if (!adjusted) return [];
    const baseMap = new Map(baseline.map((r) => [r.id, r.score]));
    return adjusted
      .map((r) => ({ row: r, delta: r.score - (baseMap.get(r.id) ?? r.score) }))
      .filter((m) => Math.abs(m.delta) > 0.0005)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);
  }, [baseline, adjusted]);

  return (
    <Card>
      <CardHeader
        title="Scenario comparison"
        subtitle="Change in priority score between the baseline and adjusted weights"
      />
      {!adjusted ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          Apply adjusted weights to compare against the baseline ranking.
        </p>
      ) : movers.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          The ranking is unchanged under these weights.
        </p>
      ) : (
        <ul className="space-y-1.5 px-4 pb-3 pt-3">
          {movers.map(({ row, delta }) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-forest/10 px-2.5 py-1.5 text-xs"
            >
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <GitCompareArrows className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {row.district} · {row.crop}
              </span>
              <span
                className={`inline-flex items-center gap-1 font-medium tabular-nums ${
                  delta > 0 ? "text-danger" : "text-success"
                }`}
              >
                {delta > 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {delta > 0 ? "+" : ""}
                {fmtNumber(delta * 100, 1)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <SourceNote>
        Both scenarios are computed server-side; nothing is re-ranked in the browser.
      </SourceNote>
    </Card>
  );
}
