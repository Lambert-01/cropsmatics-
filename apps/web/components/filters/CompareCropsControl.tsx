"use client";

import { GitCompare, X } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { useCrops } from "@/services/hooks/useReference";
import { useFilters } from "@/services/hooks/useFilters";

const MAX_COMPARE = 5;
const MIN_COMPARE = 2;

/**
 * Optional crop comparison control (section F).
 *
 * The main global Crop filter stays SINGLE SELECT. This is a separate,
 * explicit control: picking 2-5 crops fills the URL `compare` param which
 * drives per-crop series on national trends and post-harvest share charts.
 * Raw yield is deliberately excluded from comparisons (different crops do not
 * share a natural yield scale).
 */
export function CompareCropsControl() {
  const { filters, setFilters } = useFilters();
  const { data: crops } = useCrops();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => (filters.compare ? filters.compare.split(",").filter(Boolean) : []),
    [filters.compare],
  );

  const toggle = (name: string) => {
    const next = selected.includes(name)
      ? selected.filter((c) => c !== name)
      : selected.length >= MAX_COMPARE
        ? selected
        : [...selected, name];
    setFilters({ compare: next.length >= MIN_COMPARE ? next.join(",") : undefined });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "btn text-xs",
          selected.length >= MIN_COMPARE && "border-primary/40 bg-primary/[0.06] text-primary",
        )}
      >
        <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
        Compare crops
        {selected.length > 0 ? (
          <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-bold">
            {selected.length}
          </span>
        ) : null}
      </button>

      {selected.length > 0 ? (
        <span className="ml-1.5 inline-flex max-w-64 flex-wrap items-center gap-1 align-middle">
          {selected.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.06] px-2 py-0.5 text-[11px] text-primary"
            >
              {c}
              <button
                type="button"
                aria-label={`Remove ${c} from comparison`}
                onClick={() => toggle(c)}
                className="rounded-full p-0.5 hover:bg-primary/10"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </span>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-label="Compare crops"
          className="absolute left-0 z-40 mt-1 w-72 rounded-lg border border-forest/15 bg-white p-3 shadow-pop"
        >
          <p className="text-xs font-semibold text-forest-deep">Pick 2–5 crops to compare</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Compares harvested area and production. Raw yield is not compared: different crops have
            incomparable natural yield scales.
          </p>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {(crops ?? []).map((c) => {
              const checked = selected.includes(c.crop_name);
              const disabled = !checked && selected.length >= MAX_COMPARE;
              return (
                <label
                  key={c.crop_code}
                  className={cn(
                    "flex items-center gap-2 rounded px-1.5 py-1 text-xs",
                    disabled ? "opacity-40" : "hover:bg-forest/[0.04]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(c.crop_name)}
                  />
                  <span className="text-slate-700">{c.crop_name}</span>
                </label>
              );
            })}
          </div>
          {selected.length >= MIN_COMPARE ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-primary mt-2 w-full py-1 text-xs"
            >
              Apply comparison
            </button>
          ) : (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Select at least {MIN_COMPARE} crops
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
