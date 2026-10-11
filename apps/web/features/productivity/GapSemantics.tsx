import { Info } from "lucide-react";

import { benchmarkLabel, periodLabel } from "@/lib/format";

/**
 * What a gap figure means, printed above it.
 *
 * The previous heatmap communicated its metric through a colour legend alone,
 * which left the reader to infer four things that a chart should never make them
 * infer: which metric, in which unit, for which period, and which direction is
 * good. Every gap view states all four in words, so the same panel is readable
 * with no colour perception at all.
 *
 * The "higher is worse" line is not decoration. `gap_index` is positive when a
 * district is *below* its benchmark, which is the opposite of how most readers
 * expect a percentage to behave, and a district with a large gap is not a
 * success.
 */
export function GapSemantics({
  period,
  benchmark,
  metric = "Yield gap index",
  unit = "%",
}: {
  period?: string | null;
  benchmark?: string | null;
  metric?: string;
  unit?: string;
}) {
  const labels = "font-semibold text-slate-600";

  return (
    <div className="flex items-start gap-2 px-4 pt-3 text-[11px] leading-relaxed text-slate-500">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
      <p>
        <span className={labels}>Metric:</span> {metric} · <span className={labels}>Unit:</span>{" "}
        {unit} · <span className={labels}>Period:</span> {periodLabel(period)} ·{" "}
        <span className={labels}>Benchmark:</span> {benchmarkLabel(benchmark)}.
        <br />
        <span className={labels}>Direction:</span> higher is worse — a positive value means the
        district sits <strong>below</strong> its benchmark, not above it.
      </p>
    </div>
  );
}
