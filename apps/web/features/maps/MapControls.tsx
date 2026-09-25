"use client";

import { Layers, Tags } from "lucide-react";

import { cn } from "@/lib/cn";
import { MAP_METRICS, type MapMetricId } from "@/lib/constants";

export function MapControls({
  metric,
  onMetric,
  showLabels,
  onToggleLabels,
  showFacilities,
  onToggleFacilities,
}: {
  metric: MapMetricId;
  onMetric: (metric: MapMetricId) => void;
  showLabels: boolean;
  onToggleLabels: (value: boolean) => void;
  showFacilities: boolean;
  onToggleFacilities: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Map metric"
        className="flex flex-wrap gap-1 rounded-lg border border-forest/10 bg-forest/[0.03] p-1"
      >
        {MAP_METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onMetric(m.id)}
            aria-pressed={metric === m.id}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition",
              metric === m.id
                ? "bg-primary text-white shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-forest",
            )}
          >
            {m.label}
          </button>
        ))}
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
