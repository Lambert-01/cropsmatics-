"use client";

import { CalendarRange } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { coverageText, periodTimelineState, type PeriodTimelineItem } from "@/lib/coverage";
import type { ScopeView } from "@/lib/filters";

/**
 * The published-period axis as a compact coverage list.
 *
 * This used to be the Overview's opening element: fourteen equally prominent
 * cards, each with its own bar, its own coverage line and a "snapshot" label.
 * It answered "which releases exist?" on the first screen, which nobody arrives
 * asking. It is now a dense list, rendered inside the coverage popover of
 * `PeriodScopeControl`, so the same information stays one interaction away
 * instead of ahead of the answer.
 *
 * Two states are still shown differently on purpose - the release the page is
 * *filtered to*, and the release a *snapshot* came from. Conflating them is what
 * made a one-release dashboard read as "all periods".
 *
 * `bare` renders the list without its own card, for embedding in a popover.
 */
export function PeriodTimeline({
  periods,
  view,
  selectedPeriod,
  snapshotPeriod,
  onSelect,
  bare = false,
}: {
  periods: readonly PeriodTimelineItem[];
  view?: ScopeView;
  selectedPeriod?: string | null;
  snapshotPeriod?: string | null;
  /** `null` renders a read-only list. `undefined` selects all published periods. */
  onSelect?: ((periodCode: string | undefined) => void) | null;
  bare?: boolean;
}) {
  if (periods.length === 0) return null;

  const cells = periodTimelineState(periods, { view, selectedPeriod, snapshotPeriod });
  const maxCrops = Math.max(...cells.map((cell) => cell.n_crops), 1);

  const list = (
    <ul className="divide-y divide-forest/[0.06]">
      {cells.map((cell) => {
        const interactive = typeof onSelect === "function";
        const content = (
          <>
            <span className="mt-0.5 h-4 w-14 shrink-0 rounded-sm bg-forest/[0.04]">
              {/* Height encodes crops published in the release: a property of the
                  data, never a derived indicator. */}
              <span
                className={cn(
                  "block w-full rounded-sm",
                  cell.state === "selected"
                    ? "bg-primary"
                    : cell.state === "snapshot"
                      ? "bg-info/60"
                      : "bg-forest/25",
                )}
                style={{ height: `${Math.max((cell.n_crops / maxCrops) * 100, 8)}%` }}
              />
            </span>
            <span className="w-14 shrink-0 font-mono text-xs font-semibold text-forest-deep">
              {cell.period_code}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{cell.label}</span>
            <span
              className={cn(
                "shrink-0 text-[11px]",
                cell.coverage_level ? "text-slate-500" : "text-amber-700",
              )}
            >
              {coverageText(cell)}
            </span>
            {cell.state === "selected" ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-forest-deep">
                selected
              </span>
            ) : null}
            {cell.state === "snapshot" ? (
              <span className="shrink-0 rounded-full bg-info/10 px-1.5 text-[10px] font-semibold text-info">
                snapshot
              </span>
            ) : null}
            {cell.is_latest && cell.state === "available" ? (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                latest
              </span>
            ) : null}
          </>
        );

        return (
          <li key={cell.period_code}>
            {interactive ? (
              <button
                type="button"
                aria-pressed={cell.state === "selected"}
                aria-label={`${cell.label} — ${coverageText(cell)}${
                  cell.state === "snapshot" ? "; the release the district snapshot came from" : ""
                }`}
                onClick={() => onSelect!(cell.period_code)}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-1.5 text-left transition hover:bg-forest/[0.03]",
                  cell.state === "selected" && "bg-primary/[0.05]",
                )}
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const note = (
    <SourceNote>
      Period axis from /meta/periods, derived from the processed tables rather than a fixed list.
      Bars show how many crops each release published. A release with no district rows is marked
      national only and is never used to colour a district map.
    </SourceNote>
  );

  if (bare) {
    return (
      <>
        {list}
        {note}
      </>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Publication coverage"
        subtitle="Every release the serving system carries, and what each one covers"
        action={<CalendarRange className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />}
      />
      {list}
    </Card>
  );
}
