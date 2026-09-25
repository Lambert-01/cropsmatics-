/** UI-side presentation constants. No analytical values live here. */

export const MAP_METRICS = [
  { id: "gap", label: "Productivity gap" },
  { id: "yield", label: "Yield" },
  { id: "priority", label: "Intervention priority" },
  { id: "input_adoption", label: "Input adoption" },
  { id: "irrigation", label: "Irrigation" },
  { id: "erosion", label: "Erosion protection" },
] as const;

export type MapMetricId = (typeof MAP_METRICS)[number]["id"];

export const METRIC_SEMANTICS: Record<
  MapMetricId,
  { higherIs: "better" | "worse" | "neutral"; note: string }
> = {
  gap: { higherIs: "worse", note: "Higher = yield further below benchmark" },
  yield: { higherIs: "better", note: "Higher = greater observed yield" },
  priority: { higherIs: "neutral", note: "Higher = ranked for earlier investigation" },
  input_adoption: { higherIs: "neutral", note: "Share of farmers using each practice" },
  irrigation: { higherIs: "neutral", note: "Share of farmers reporting irrigation" },
  erosion: { higherIs: "neutral", note: "Share of farmers reporting erosion protection" },
};

/** Priority bands are always shown as colour + text (+ icon at call sites). */
export const PRIORITY_BANDS: Record<string, { label: string; className: string; icon: string }> = {
  CRITICAL: { label: "Critical", className: "bg-danger/10 text-danger border-danger/30", icon: "▲" },
  HIGH: { label: "High", className: "bg-amber/10 text-amber border-amber/30", icon: "▲" },
  MEDIUM: { label: "Medium", className: "bg-info/10 text-info border-info/30", icon: "■" },
  LOW: { label: "Low", className: "bg-success/10 text-success border-success/30", icon: "●" },
};

export function priorityBand(band: string | null | undefined) {
  return PRIORITY_BANDS[(band ?? "").toUpperCase()] ?? PRIORITY_BANDS.LOW;
}

export const SEASONS = ["A", "B", "C"] as const;
