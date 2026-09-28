"use client";

import { Info } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import type { GapBand } from "@/types";

/**
 * Severity ramp for the gap bands. Colour is never the only encoding: every row
 * prints its own cut points and count, so the classification is readable without
 * relying on the swatch.
 */
const BAND_STYLES: Record<string, { bar: string; dot: string }> = {
  above_benchmark: { bar: "bg-success", dot: "bg-success" },
  near_benchmark: { bar: "bg-info", dot: "bg-info" },
  moderate_gap: { bar: "bg-amber", dot: "bg-amber" },
  high_gap: { bar: "bg-danger", dot: "bg-danger" },
};

/** Render a band's cut points exactly as the API defines them. */
function thresholdText(band: GapBand): string {
  const { min_pct: min, max_pct: max } = band;
  if (min === null || min === undefined) {
    return max === null || max === undefined ? "all" : `≤ ${fmtNumber(max, 0)}%`;
  }
  if (max === null || max === undefined) return `> ${fmtNumber(min, 0)}%`;
  return `${fmtNumber(min, 0)}–${fmtNumber(max, 0)}%`;
}

/**
 * Yield gap distribution (section 4).
 *
 * Bands come from the API with their own thresholds, so the page cannot
 * re-categorise the data or invent a friendlier breakdown. Nothing is
 * exaggerated: the cut points are printed next to every count.
 */
export function YieldGapDistribution({
  bands,
  isLoading,
  crop,
}: {
  bands: GapBand[];
  isLoading?: boolean;
  crop?: string;
}) {
  const scored = bands ?? [];
  const total = scored.reduce((sum, band) => sum + band.count, 0);
  const maxCount = scored.reduce((max, band) => Math.max(max, band.count), 0);

  return (
    <Card>
      <CardHeader
        title="Yield gap distribution"
        subtitle={
          crop
            ? `Districts grouped by how far ${crop} yield sits from the benchmark`
            : "Select a crop to classify districts by yield gap"
        }
      />

      <div className="flex items-start gap-2 px-4 pt-2 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
        <span>
          A positive gap means the district is <strong>below</strong> the benchmark. The bands are
          descriptive, not a judgement about any district.
        </span>
      </div>

      {!crop ? (
        <div className="p-4">
          <EmptyState
            title="Select a crop to see where its yield sits relative to the benchmark."
            hint="Gaps are measured against each crop's own benchmark, so a crop must be named."
          />
        </div>
      ) : isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-forest/[0.06]" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No gap could be computed for this selection."
            hint="This needs at least one district with a published yield and a benchmark for the crop."
          />
        </div>
      ) : (
        <ul className="space-y-2.5 px-4 pb-2 pt-3">
          {scored.map((band) => {
            const style = BAND_STYLES[band.id] ?? BAND_STYLES.near_benchmark;
            const width = maxCount === 0 ? 0 : Math.max((band.count / maxCount) * 100, 2);
            return (
              <li key={band.id}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <span
                      className={cn("inline-block h-2 w-2 rounded-full", style.dot)}
                      aria-hidden="true"
                    />
                    {band.label}
                    <span className="font-normal text-slate-400">({thresholdText(band)})</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {band.count} district{band.count === 1 ? "" : "s"}
                    {band.share_pct != null ? (
                      <span className="ml-1.5 text-slate-400">{fmtNumber(band.share_pct, 0)}%</span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-forest/[0.06]">
                  <div
                    className={cn("h-full rounded-full", style.bar)}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SourceNote>
        {total} district{total === 1 ? "" : "s"} classified. Bands and their cut points are computed
        by the API, so this panel can never re-bucket the data. A district-median gap is used per
        district, and the benchmark strategy changes the result.
      </SourceNote>
    </Card>
  );
}
