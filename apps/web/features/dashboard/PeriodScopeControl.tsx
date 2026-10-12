"use client";

import { CalendarRange, Check, ChevronDown, History } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, SourceNote } from "@/components/ui/Card";
import { PeriodTimeline } from "@/features/dashboard/PeriodTimeline";
import { cn } from "@/lib/cn";
import { sortPeriods, type PeriodTimelineItem } from "@/lib/coverage";
import { SCOPE_HISTORY, type DashboardFilters, type ScopeView } from "@/lib/filters";
import { periodLabel } from "@/lib/format";
import {
  axisCoverageNote,
  periodCodeFor,
  publishedRangeSummary,
  publishedYears,
  seasonsForYear,
} from "@/lib/periodControl";

/**
 * The compact historical-scope control.
 *
 * This is what replaced the fourteen equally prominent release cards that used
 * to fill the first screen. The published axis is still fully reachable - there
 * is an explicit "All published periods" scope, a year control, a season control
 * and a coverage popover listing every release - but the *default* view spends
 * one compact row on it instead of an entire screenful.
 *
 * Three rules the control is built around:
 *
 * 1. A year resolves to the seasons that year really published, so a year
 *    selection can never ask for a period that does not exist.
 * 2. Choosing a season writes the canonical period code in a single update, so
 *    the scope is one value rather than a year/season pair that has to be kept
 *    in step afterwards (that second write was what re-keyed the queries and
 *    tore down the charts).
 * 3. "All published periods" is an explicit scope that beats a stored default
 *    period, rather than the absence of a selection.
 */
export function PeriodScopeControl({
  periods,
  view,
  period,
  year,
  season,
  onChange,
}: {
  periods: readonly PeriodTimelineItem[];
  view?: ScopeView;
  period?: string;
  year?: number;
  season?: string;
  onChange: (patch: Partial<DashboardFilters>) => void;
}) {
  const years = useMemo(() => publishedYears(periods), [periods]);
  const seasons = useMemo(() => seasonsForYear(periods, year), [periods, year]);
  const historySelected = view !== "period" && !period && !year && !season;

  const summary = useMemo(() => publishedRangeSummary(periods), [periods]);
  const coverageNote = useMemo(() => axisCoverageNote(periods), [periods]);
  // Releases the serving dataset does not carry yet. They stay visible in the
  // axis (the release exists) but cannot be selected, and the reason is named.
  const unavailable = useMemo(
    () => periods.filter((item) => item.servable === false),
    [periods],
  );

  // The selected release, resolved from whatever selection is active. A legacy
  // year+season link is named by its own code so the label never goes blank.
  const selectedCode =
    period ?? (periodCodeFor(year, season) as string | undefined) ?? null;
  const selectedItem = periods.find((item) => item.period_code === selectedCode);

  const ordered = useMemo(
    () => sortPeriods(periods.map((item) => item.period_code)),
    [periods],
  );

  const selectAllPeriods = () =>
    onChange({ period: undefined, year: undefined, season: undefined, view: SCOPE_HISTORY });

  const selectYear = (value: string) => {
    if (!value) {
      selectAllPeriods();
      return;
    }
    const seasonsInYear = seasonsForYear(periods, value);
    // A year with exactly one published season is unambiguous, so it opens on
    // that release directly rather than making the reader pick again.
    const only = seasonsInYear.length === 1 ? periodCodeFor(value, seasonsInYear[0]) : undefined;
    onChange({
      period: only,
      year: only ? undefined : Number(value),
      season: undefined,
      view: "period",
    });
  };

  const selectSeason = (value: string) => {
    if (!value) {
      // Keep the year, drop the season: the scope is that year's releases.
      onChange({ period: undefined, season: undefined, year: year, view: "period" });
      return;
    }
    const code = periodCodeFor(year, value);
    onChange({
      period: code,
      year: undefined,
      season: undefined,
      view: "period",
    });
  };

  return (
    <Card className="px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <button
          type="button"
          aria-pressed={historySelected}
          onClick={selectAllPeriods}
          className={cn(
            "btn h-[38px] shrink-0 gap-1.5 text-xs",
            historySelected && "btn-primary",
          )}
          title="All published periods: no single release is selected"
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          All published periods
          {historySelected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
        </button>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Year
          </span>
          <div className="relative">
            <select
              aria-label="Year"
              value={year ? String(year) : ""}
              onChange={(e) => selectYear(e.target.value)}
              className="input h-[38px] w-[7.5rem] appearance-none pr-8"
            >
              <option value="">All years</option>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Season
          </span>
          <div className="relative">
            <select
              aria-label="Season"
              value={season ?? ""}
              disabled={seasons.length === 0}
              title={seasons.length === 0 ? "Select a year first" : undefined}
              onChange={(e) => selectSeason(e.target.value)}
              className={cn(
                "input h-[38px] w-[8.5rem] appearance-none pr-8",
                seasons.length === 0 && "cursor-not-allowed opacity-60",
              )}
            >
              <option value="">{year ? "All seasons" : "Select a year"}</option>
              {seasons.map((value) => (
                <option key={value} value={value}>
                  Season {value}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
          </div>
        </label>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-0.5">
          <p className="text-xs font-medium text-forest-deep" aria-live="polite">
            {selectedItem
              ? `Scope: ${selectedItem.label}`
              : year
                ? `Scope: every ${year} release published`
                : `Scope: all published periods`}
          </p>
          {summary ? <p className="text-[11px] text-slate-500">{summary}</p> : null}
        </div>

        <CoveragePopover periods={periods} className="pb-0.5" />
      </div>

      {unavailable.length > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 border-t border-forest/5 pt-2 text-[11px] leading-relaxed text-amber-700">
          <span aria-hidden="true">ⓘ</span>
          {unavailable.length === 1
            ? `${unavailable[0]?.period_code} is published but the serving dataset does not carry it yet, so it cannot be selected. It becomes available after the database is synchronised with the built data.`
            : `${unavailable.length} published releases (${unavailable
                .map((item) => item.period_code)
                .join(", ")}) are not carried by the serving dataset yet, so they cannot be selected. They become available after the database is synchronised with the built data.`}
        </p>
      ) : null}

      {coverageNote ? (
        <p className="mt-2 flex items-start gap-1.5 border-t border-forest/5 pt-2 text-[11px] leading-relaxed text-amber-700">
          <span aria-hidden="true">ⓘ</span>
          {coverageNote}
        </p>
      ) : null}

      <SourceNote>
        Period axis from /meta/periods and the Overview response — derived from the processed tables,
        never a fixed list. {ordered.length > 0 ? `${ordered[0]}–${ordered[ordered.length - 1]}` : ""}{" "}
        are the releases the serving system can substantiate.
      </SourceNote>
    </Card>
  );
}

/**
 * Coverage popover: the advanced view of the published axis.
 *
 * Kept one interaction away instead of on the first screen. It renders the same
 * per-release timeline the page used to lead with, so nothing became
 * undiscoverable - it just stopped outranking the answer.
 */
function CoveragePopover({
  periods,
  className,
}: {
  periods: readonly PeriodTimelineItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const unrecorded = periods.filter((item) => !item.coverage_level).length;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="btn h-[38px] shrink-0 gap-1.5 text-xs"
        title="Publication coverage for every release"
      >
        <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
        Coverage
        {unrecorded > 0 ? (
          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
            {unrecorded}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Publication coverage"
          className="absolute right-0 z-40 mt-1 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-forest/15 bg-white shadow-pop"
        >
          <div className="max-h-[26rem] overflow-y-auto">
            <PeriodTimeline
              periods={periods}
              snapshotPeriod={null}
              onSelect={null}
              bare
            />
          </div>
          <p className="border-t border-forest/10 px-4 py-2 text-[11px] text-slate-500">
            Each release lists only the coverage the serving system can substantiate. A release with
            no recorded level is never drawn as a district map.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Convenience: the label for a period code, or the code itself. */
export function periodOptionLabel(code: string): string {
  return periodLabel(code);
}
