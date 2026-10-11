"use client";

import { CalendarRange } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { periodTimelineState, type PeriodTimelineItem } from "@/lib/coverage";
import type { ScopeView } from "@/lib/filters";
import { periodLabel } from "@/lib/format";

/**
 * The published-period axis, as a control.
 *
 * This is what makes "all published periods" a legible scope rather than an
 * absence of one: the reader sees how many releases exist, what each covers, and
 * which one is currently in use. Two states are shown differently on purpose -
 * the period the page is *filtered to*, and the period a *snapshot* came from.
 * Conflating them is the ambiguity that made a one-release dashboard read as
 * "all periods".
 *
 * The bars encode the number of crops each release published, which is a fact of
 * the data, not a derived indicator - no new statistic is computed here.
 */
export function PeriodTimeline({
  periods,
  view,
  selectedPeriod,
  snapshotPeriod,
  onSelect,
}: {
  periods: readonly PeriodTimelineItem[];
  view?: ScopeView;
  selectedPeriod?: string | null;
  snapshotPeriod?: string | null;
  /** `undefined` selects the all-published-periods scope. */
  onSelect: (periodCode: string | undefined) => void;
}) {
  if (periods.length === 0) return null;

  const cells = periodTimelineState(periods, { view, selectedPeriod, snapshotPeriod });
  const maxCrops = Math.max(...cells.map((cell) => cell.n_crops), 1);
  const allSelected = view !== "period";

  return (
    <Card>
      <CardHeader
        title="Published periods"
        subtitle="Every release the pipeline carries, for this data domain"
        action={<CalendarRange className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />}
      />
      <div className="px-4 pb-2 pt-3">
        <div role="group" aria-label="Published periods" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={allSelected}
            onClick={() => onSelect(undefined)}
            className={cn(
              "flex min-w-[7.5rem] flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
              allSelected
                ? "border-primary bg-primary/[0.08] font-semibold text-forest-deep"
                : "border-forest/15 text-slate-600 hover:border-forest/30 hover:bg-forest/[0.03]",
            )}
          >
            <span>All published periods</span>
            <span className="text-[10px] font-normal text-slate-500">
              {cells.length} releases · multi-period view
            </span>
          </button>

          {cells.map((cell) => {
            const active = cell.state !== "available";
            return (
              <button
                key={cell.period_code}
                type="button"
                aria-pressed={cell.state === "selected"}
                aria-label={`${cell.label} - ${cell.coverageText}${
                  cell.state === "snapshot" ? "; district snapshot" : ""
                }`}
                title={cell.label}
                onClick={() => onSelect(cell.period_code)}
                className={cn(
                  "flex w-[4.5rem] flex-col items-stretch gap-1 rounded-lg border px-2 py-1.5 text-left transition",
                  cell.state === "selected"
                    ? "border-primary bg-primary/[0.08]"
                    : cell.state === "snapshot"
                      ? "border-info/40 bg-info/[0.06]"
                      : "border-forest/15 hover:border-forest/30 hover:bg-forest/[0.03]",
                )}
              >
                <span
                  className={cn(
                    "text-xs",
                    active ? "font-semibold text-forest-deep" : "text-slate-600",
                  )}
                >
                  {cell.period_code}
                </span>
                {/* Height encodes crops published in the release: a property of
                    the data, never a derived indicator. */}
                <span className="flex h-5 items-end" aria-hidden="true">
                  <span
                    className={cn(
                      "w-full rounded-sm",
                      cell.state === "selected"
                        ? "bg-primary"
                        : cell.state === "snapshot"
                          ? "bg-info/60"
                          : "bg-forest/25",
                    )}
                    style={{ height: `${Math.max((cell.n_crops / maxCrops) * 100, 8)}%` }}
                  />
                </span>
                <span className="text-[10px] leading-tight text-slate-500">
                  {cell.coverageText}
                </span>
                {cell.state === "snapshot" ? (
                  <span className="text-[10px] font-semibold leading-tight text-info">
                    snapshot
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <SourceNote>
        Period axis from /meta/periods (derived from the processed tables, not a fixed list). Bars
        show the number of crops each release published. A release with no district rows is marked
        national only and is never used to colour a district map.
      </SourceNote>
    </Card>
  );
}
