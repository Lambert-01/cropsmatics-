"use client";

import { ArrowDownRight, ArrowUpRight, Minus, Sprout } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import { summarizeDistricts, type DistrictRow } from "@/lib/yield";
import type { SameSeasonYoY } from "@/types";

/**
 * The Overview workspace.
 *
 * Deliberately short: four KPIs are rendered by the page above this, and here we
 * add only what makes them interpretable — the same-season change written out in
 * full, the spread of districts around their benchmark, and the two districts a
 * reader should look at first. Nothing here is a second dashboard.
 */
export function YieldOverview({
  crop,
  district,
  rows,
  yoy,
  periodText,
  isLoading,
  onSelectDistrict,
}: {
  crop: string;
  district?: string;
  rows: DistrictRow[];
  yoy?: SameSeasonYoY | null;
  periodText?: string | null;
  isLoading?: boolean;
  onSelectDistrict?: (district: string) => void;
}) {
  const summary = summarizeDistricts(rows);

  return (
    <div className="space-y-5">
      <SameSeasonChange crop={crop} district={district} yoy={yoy} periodText={periodText} />

      {isLoading ? null : summary.nWithYield === 0 ? (
        <Card>
          <EmptyState
            title={`No published ${crop} yield for this selection.`}
            hint="No observation was published for this crop in the selected period. Missing is shown as missing — it is never filled with a zero or an estimate."
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title={`Districts against the ${crop} benchmark`}
              subtitle={`${summary.nWithYield} districts with a published yield in this selection`}
            />
            <div className="space-y-3 px-4 pb-4 pt-4">
              <DistributionBar
                below={summary.nBelowBenchmark}
                atOrAbove={summary.nAtOrAboveBenchmark}
              />
              <p className="text-xs text-slate-600">
                {summary.shareBelowBenchmarkPct === null ? (
                  "No district in this selection carries a measurable gap."
                ) : (
                  <>
                    <strong className="text-forest-deep">
                      {fmtNumber(summary.shareBelowBenchmarkPct, 0)}%
                    </strong>{" "}
                    of measured districts are below their own {crop} benchmark (
                    {summary.nBelowBenchmark} of{" "}
                    {summary.nBelowBenchmark + summary.nAtOrAboveBenchmark}).
                  </>
                )}
              </p>
            </div>
            <SourceNote>
              Each district is compared with the benchmark strategy selected in the filter bar, not
              with a single national figure.
            </SourceNote>
          </Card>

          <div className="space-y-4">
            <SignalCard
              title="Highest observed yield"
              district={summary.highest?.district}
              value={summary.highest?.value}
              unit="kg/ha"
              tone="good"
              onSelect={onSelectDistrict}
            />
            <SignalCard
              title="Largest gap signal"
              district={summary.largestGap?.district}
              value={summary.largestGap?.value}
              unit="% below benchmark"
              tone="bad"
              onSelect={onSelectDistrict}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** One district x value, clickable to open it in the Spatial workspace. */
function SignalCard({
  title,
  district,
  value,
  unit,
  tone,
  onSelect,
}: {
  title: string;
  district?: string;
  value?: number;
  unit: string;
  tone: "good" | "bad";
  onSelect?: (district: string) => void;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {district === undefined || value === undefined ? (
        <p className="mt-1.5 text-xs text-slate-500">Not measurable for this selection.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onSelect?.(district)}
            className="mt-1.5 block text-sm font-semibold text-primary hover:underline"
          >
            {district}
          </button>
          <p
            className={cn(
              "mt-0.5 text-xs font-medium",
              tone === "good" ? "text-success" : "text-danger",
            )}
          >
            {fmtNumber(value, tone === "good" ? 0 : 1)} {unit}
          </p>
        </>
      )}
    </Card>
  );
}

/**
 * Districts below vs at/above benchmark.
 *
 * The bar is labelled with both counts, so the split is readable without colour.
 */
function DistributionBar({ below, atOrAbove }: { below: number; atOrAbove: number }) {
  const total = below + atOrAbove;
  if (total === 0) {
    return <div className="h-3 w-full rounded-full bg-slate-100" aria-hidden="true" />;
  }
  const belowPct = (below / total) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-success/20" role="img"
        aria-label={`${below} districts below benchmark, ${atOrAbove} at or above`}>
        <div className="h-full bg-danger/70" style={{ width: `${belowPct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger/70 align-middle" />
          {below} below benchmark
        </span>
        <span>
          {atOrAbove} at or above
          <span className="ml-1 inline-block h-2 w-2 rounded-full bg-success/40 align-middle" />
        </span>
      </div>
    </div>
  );
}

/** The same-season change, written out with both periods and both values. */
function SameSeasonChange({
  crop,
  district,
  yoy,
  periodText,
}: {
  crop: string;
  district?: string;
  yoy?: SameSeasonYoY | null;
  periodText?: string | null;
}) {
  const scope = district ? `in ${district}` : "across all districts";

  if (!yoy) {
    return (
      <Card className="flex items-start gap-2 p-4 text-xs text-slate-500">
        <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          A same-season comparison needs a published period. Choose a period above to compare {crop}{" "}
          yield with the same season one year earlier.
        </span>
      </Card>
    );
  }

  if (!yoy.available) {
    return (
      <Card className="flex items-start gap-2 p-4 text-xs text-slate-500">
        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
        <span>
          No same-season comparison is available for {crop} {scope}.{" "}
          {yoy.reason ?? "The previous year has no published release for this selection."}
        </span>
      </Card>
    );
  }

  const change = yoy.change_pct ?? 0;
  const flat = change === 0;
  const up = change > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
          flat ? "bg-slate-100 text-slate-600" : up ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {flat ? "unchanged" : `${up ? "+" : ""}${fmtNumber(change, 1)}%`}
      </span>
      <p className="text-xs text-slate-600">
        {crop} mean observed yield {scope} was{" "}
        <strong className="text-forest-deep">
          {fmtNumber(yoy.current_yield_kg_ha ?? null, 0)} kg/ha
        </strong>{" "}
        in {periodText ?? yoy.period_label ?? "the selected period"}, versus{" "}
        <strong className="text-forest-deep">
          {fmtNumber(yoy.previous_yield_kg_ha ?? null, 0)} kg/ha
        </strong>{" "}
        in {yoy.previous_period_label ?? "the previous year"}. Same season, one year apart — seasons
        differ agronomically, so consecutive seasons are not a time series.
      </p>
    </Card>
  );
}
