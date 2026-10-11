"use client";

import { ChevronDown, Grid3x3 } from "lucide-react";
import { useId, useState } from "react";

import { GapHeatmap } from "@/features/dashboard/GapHeatmap";
import type { DashboardFilters } from "@/lib/filters";
import { cn } from "@/lib/cn";
import { useHeatmap } from "@/services/hooks/useAnalytics";

/**
 * The district × crop gap matrix, demoted behind a disclosure (view E).
 *
 * The matrix is genuinely useful — it is the only view that shows a district's
 * gap across *several* crops at once, which is how you spot a district that is
 * uniformly weak rather than weak in one crop. It is a poor *primary* view
 * because every cell carries equal weight, so 30 districts × 15 crops forces the
 * reader to scan ~450 numbers to find the handful that matter, and the extremes
 * are the only thing anyone actually looks for. Sampled analytical views do that
 * job better, which is why it now lives here.
 *
 * The heatmap request is issued on first expand, not on mount. The matrix is a
 * large response and most sessions never open it, so fetching it eagerly would
 * pay that cost on every dashboard load for nothing.
 */
export function GapAdvancedMatrix({
  filters,
  districtMode,
}: {
  filters: DashboardFilters;
  districtMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const heatmap = useHeatmap(filters, "gap", districtMode && open);

  return (
    <details
      className="group"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={cn(
          "card flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
        aria-controls={contentId}
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <Grid3x3 className="mt-0.5 h-4 w-4 shrink-0 text-forest/60" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-forest">
              Advanced analysis · district × crop gap matrix
            </span>
            <span className="card-subtitle mt-0.5 block">
              The full grid, every district against every crop. Heavier to read, but it is the only
              view that shows one district&apos;s gap across several crops at once.
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            {open ? "Hide" : "Loaded on demand"}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 text-forest/60 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </summary>

      <div id={contentId} className="mt-3">
        {open ? <GapHeatmap data={heatmap.data} isLoading={heatmap.isLoading} /> : null}
      </div>
    </details>
  );
}
