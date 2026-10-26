/** UI-side presentation constants. No analytical values live here. */

export const MAP_METRICS = [
  // Additive quantities first: they are valid for any crop selection (or none),
  // so the map opens on a metric that always renders instead of one that needs
  // a crop before it can be coloured.
  { id: "production", label: "Production" },
  { id: "harvested_area", label: "Harvested area" },
  { id: "gap", label: "Productivity gap" },
  { id: "yield", label: "Yield" },
  { id: "priority", label: "Intervention priority" },
  { id: "input_adoption", label: "Input adoption" },
  { id: "irrigation", label: "Irrigation" },
  { id: "erosion", label: "Erosion protection" },
] as const;

export type MapMetricId = (typeof MAP_METRICS)[number]["id"];

/**
 * How a metric's colours should be read. The legend renders a different
 * control for each kind, because they mean different things:
 *
 * * `sequential`          - larger quantity, darker fill. Never "worse".
 * * `sequential_reversed` - higher is better, darker fill (crop-specific yield).
 * * `diverging`           - signed value around a real zero (the productivity
 *                          gap, where 0 is the benchmark).
 * * `bands`               - a score that is binned, shown as labelled bands.
 */
export type MapScaleKind = "sequential" | "sequential_reversed" | "diverging" | "bands";

export const METRIC_SEMANTICS: Record<
  MapMetricId,
  { higherIs: "better" | "worse" | "neutral"; scaleKind: MapScaleKind; direction: string; note: string }
> = {
  production: {
    higherIs: "neutral",
    scaleKind: "sequential",
    direction: "darker = more production",
    note: "Total published production across the crop selection",
  },
  harvested_area: {
    higherIs: "neutral",
    scaleKind: "sequential",
    direction: "darker = more harvested area",
    note: "Total published harvested area across the crop selection",
  },
  gap: {
    higherIs: "worse",
    scaleKind: "diverging",
    direction: "red = below benchmark · green = at or above benchmark",
    note: "Signed distance from the benchmark; 0 is the benchmark itself",
  },
  yield: {
    higherIs: "better",
    scaleKind: "sequential_reversed",
    direction: "darker = higher observed yield",
    note: "Higher = greater observed yield for this crop",
  },
  priority: {
    higherIs: "neutral",
    scaleKind: "bands",
    direction: "banded planning score — not a probability",
    note: "Relative planning score for investigation, in bands",
  },
  input_adoption: {
    higherIs: "neutral",
    scaleKind: "sequential",
    direction: "darker = more farmers reporting the practice",
    note: "Share of farmers using each practice",
  },
  irrigation: {
    higherIs: "neutral",
    scaleKind: "sequential",
    direction: "darker = more farmers reporting irrigation",
    note: "Share of farmers reporting irrigation",
  },
  erosion: {
    higherIs: "neutral",
    scaleKind: "sequential",
    direction: "darker = more farmers reporting erosion protection",
    note: "Share of farmers reporting erosion protection",
  },
};

/**
 * Band thresholds for the priority score, mirrored from
 * `analytics/intervention_priority.band_for` (0.75 / 0.5 / 0.25).
 *
 * The API is the authority: when a district carries `details.priority_band` the
 * legend and the tooltip use that value, and these thresholds only colour a score
 * the API did not label. They are here so a legend never has to invent a boundary.
 */
export const PRIORITY_BAND_STOPS: { band: string; min: number }[] = [
  { band: "CRITICAL", min: 0.75 },
  { band: "HIGH", min: 0.5 },
  { band: "MEDIUM", min: 0.25 },
  { band: "LOW", min: 0 },
];

/** Fill colour per band, deliberately not a continuous gradient. */
export const PRIORITY_BAND_FILL: Record<string, string> = {
  CRITICAL: "#b91c1c",
  HIGH: "#f97316",
  MEDIUM: "#facc15",
  LOW: "#4ade80",
};

/** Band for a score the API did not label. */
export function bandForScore(score: number): string {
  for (const stop of PRIORITY_BAND_STOPS) {
    if (score >= stop.min) return stop.band;
  }
  return "LOW";
}

/** Priority bands are always shown as colour + text (+ icon at call sites). */
export const PRIORITY_BANDS: Record<string, { label: string; className: string; icon: string }> = {
  CRITICAL: { label: "Critical", className: "bg-danger/10 text-danger border-danger/30", icon: "▲" },
  HIGH: { label: "High", className: "bg-amber/10 text-amber-800 border-amber/30", icon: "▲" },
  MEDIUM: { label: "Medium", className: "bg-info/10 text-blue-800 border-info/30", icon: "■" },
  LOW: { label: "Low", className: "bg-success/10 text-green-800 border-success/30", icon: "●" },
};

export function priorityBand(band: string | null | undefined) {
  return PRIORITY_BANDS[(band ?? "").toUpperCase()] ?? PRIORITY_BANDS.LOW;
}

export const SEASONS = ["A", "B", "C"] as const;
