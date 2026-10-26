"use client";

import { Layers, Tags } from "lucide-react";

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
    <div className="flex flex-wrap items-end gap-2">
      <label className="block min-w-52">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Map layer
        </span>
        <select
          aria-label="Map layer"
          value={metric}
          onChange={(event) => onMetric(event.target.value as MapMetricId)}
          className="input w-full"
        >
          <optgroup label="Crop performance">
            {MAP_METRICS.slice(0, 4).map((m) => (
              <option
                key={m.id}
                value={m.id}
                disabled={CROP_REQUIRED.has(m.id) && !cropSelected}
              >
                {m.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Planning and practices">
            {MAP_METRICS.slice(4).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <button
        type="button"
        className="btn mb-0.5"
        aria-pressed={showLabels}
        onClick={() => onToggleLabels(!showLabels)}
      >
        <Tags className="h-3.5 w-3.5" /> Labels
      </button>
      <button
        type="button"
        className="btn mb-0.5"
        aria-pressed={showFacilities}
        onClick={() => onToggleFacilities(!showFacilities)}
        // "Program districts", not "facilities": the source publishes no facility
        // coordinates, so the layer can only ever assert programme membership.
        aria-label="Highlight cold-chain program districts (districts, not facility locations)"
        title="Highlights the districts in the cold-chain programme. No facility location or capacity is published, so no points are drawn."
      >
        <Layers className="h-3.5 w-3.5" /> Program districts
      </button>
    </div>
  );
}
