"use client";

import { Bot, X } from "lucide-react";
import { useEffect } from "react";

import { SourceNote } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import type { DistrictRow } from "@/lib/yield";
import type { PeriodTrendPoint, SameSeasonYoY } from "@/types";

/**
 * District detail drawer.
 *
 * Selecting a district used to only re-run the shared filter, which re-queried
 * every panel on the page; there was nowhere to read one district's numbers
 * together. This shows what is published for the district, and where the
 * same-season figures exist they are included — a value is shown only when the
 * selection actually has it, never as a placeholder zero.
 */
export function DistrictYieldDrawer({
  district,
  crop,
  periodText,
  row,
  yoy,
  trend,
  onClose,
  onAskAi,
}: {
  district: string;
  crop: string;
  periodText?: string | null;
  row?: DistrictRow;
  /** Same-season comparison — present only when the selection is this district. */
  yoy?: SameSeasonYoY | null;
  /** Published periods for this district, when the trend was fetched for it. */
  trend?: PeriodTrendPoint[];
  onClose: () => void;
  onAskAi?: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const num = (key: string): number | null => {
    const value = row?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  const gap = num("gap_index");

  return (
    <aside
      role="dialog"
      aria-label={`${district} yield detail`}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-forest/15 bg-white shadow-pop"
    >
      <div className="flex items-start justify-between gap-3 border-b border-forest/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-forest-deep">{district}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {crop}
            {periodText ? ` · ${periodText}` : ""}
            {row?.province ? ` · ${String(row.province)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close district detail"
          className="rounded p-1 text-slate-400 hover:bg-forest/10 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="thin-scroll flex-1 overflow-auto px-4 py-4">
        {!row ? (
          <p className="text-xs text-slate-500">
            No published {crop} observation for {district} in this period.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Observed yield" value={num("yield_kg_ha")} decimals={0} unit="kg/ha" />
            <Metric
              label="Benchmark"
              value={num("benchmark_yield_kg_ha")}
              decimals={0}
              unit="kg/ha"
            />
            <Metric
              label="Gap"
              value={gap}
              decimals={1}
              unit="%"
              tone={gap !== null && gap > 0 ? "bad" : "good"}
            />
            <Metric label="Production" value={num("production_mt")} decimals={0} unit="MT" />
            <Metric label="Harvested area" value={num("harvested_area_ha")} decimals={0} unit="ha" />
          </dl>
        )}

        {yoy?.available ? (
          <div className="mt-4 rounded-lg border border-forest/12 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Same season, one year earlier
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {fmtNumber(yoy.current_yield_kg_ha ?? null, 0)} kg/ha in {yoy.period_label ?? "this period"} vs{" "}
              {fmtNumber(yoy.previous_yield_kg_ha ?? null, 0)} kg/ha in{" "}
              {yoy.previous_period_label ?? "the previous year"} (
              {fmtNumber(yoy.change_pct ?? null, 1)}%).
            </p>
          </div>
        ) : null}

        {trend?.length ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Published periods
            </p>
            <ul className="mt-1.5 space-y-1">
              {trend.map((point) => (
                <li key={point.period_code} className="flex justify-between text-xs text-slate-600">
                  <span>{point.label}</span>
                  <span className={cn("font-medium", point.values.yield_kg_ha == null && "text-slate-400")}>
                    {point.values.yield_kg_ha == null
                      ? "not published"
                      : `${fmtNumber(point.values.yield_kg_ha, 0)} kg/ha`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-[11px] text-slate-500">
          Same-season change and the period list appear when this district is the active selection;
          they are not substituted from another district.
        </p>
      </div>

      <div className="border-t border-forest/10 px-4 py-3">
        {onAskAi ? (
          <button type="button" onClick={onAskAi} className="btn w-full justify-center">
            <Bot className="h-4 w-4" aria-hidden="true" />
            Ask Cropmatics about this district
          </button>
        ) : null}
        <SourceNote>
          Published NISR SAS district aggregates for the selected period. A blank cell stays blank.
        </SourceNote>
      </div>
    </aside>
  );
}

function Metric({
  label,
  value,
  decimals,
  unit,
  tone,
}: {
  label: string;
  value: number | null;
  decimals: number;
  unit: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold",
          value === null
            ? "text-slate-400"
            : tone === "bad"
              ? "text-danger"
              : tone === "good"
                ? "text-success"
                : "text-forest-deep",
        )}
      >
        {value === null ? "not published" : `${fmtNumber(value, decimals)} ${unit}`}
      </dd>
    </div>
  );
}
