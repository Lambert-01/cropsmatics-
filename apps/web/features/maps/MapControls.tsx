"use client";

import { Layers, Tags } from "lucide-react";

import { cn } from "@/lib/cn";
import { MAP_METRICS, type MapMetricId } from "@/lib/constants";

/** Metrics that cannot be mapped without a crop: raw yields are not comparable. */
const CROP_REQUIRED: ReadonlySet<string> = new Set(["yield"]);

export function MapControls({
  metric,
  onMetric,
  showLabels,
  onToggleLabels,
  showFacilities,
  onToggleFacilities,
  cropSelected,
}: {
  metric: MapMetricId;
  onMetric: (metric: MapMetricId) => void;
  showLabels: boolean;
  onToggleLabels: (value: boolean) => void;
  showFacilities: boolean;
  onToggleFacilities: (value: boolean) => void;
  cropSelected?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Map metric"
        className="flex flex-wrap gap-1 rounded-lg border border-forest/10 bg-forest/[0.03] p-1"
      >
        {MAP_METRICS.map((m) => {
          const disabled = CROP_REQUIRED.has(m.id) && !cropSelected;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMetric(m.id)}
              disabled={disabled}
              title={disabled ? "Select a crop to compare yield across districts." : undefined}
              aria-pressed={metric === m.id}
              aria-disabled={disabled}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                metric === m.id
                  ? "bg-primary text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-forest",
                disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn"
        aria-pressed={showLabels}
        onClick={() => onToggleLabels(!showLabels)}
      >
        <Tags className="h-3.5 w-3.5" /> Labels
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={showFacilities}
        onClick={() => onToggleFacilities(!showFacilities)}
      >
        <Layers className="h-3.5 w-3.5" /> Cold-chain
      </button>
    </div>
  );
}
