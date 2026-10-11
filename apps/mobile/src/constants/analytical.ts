/**
 * Single source of truth for the analytical metric selectors.
 *
 * The crop terminal, the home dashboard and the map each used to carry their own
 * copy of a metric list, so adding a metric meant editing three screens and a
 * disabled metric could be offered in one place and hidden in another. The
 * metric *IDs* here are the API's column names; the label is an i18n key and the
 * unit is what the API publishes the column in.
 *
 * The `unit` here is UI configuration. When a response carries its own
 * `metric_units`/`unit` map, that authoritative value is displayed instead — see
 * `resolveMetricOptions`.
 */

import type { Strings } from "../i18n/en";

export type NationalMetricId = "yield_mt_ha" | "production_mt" | "harvested_area_ha";
export type DistrictMetricId = "yield_kg_ha" | "production_mt" | "harvested_area_ha" | "gap";

export interface MetricOption<Id extends string = string> {
  id: Id;
  /** i18n key for the human label. */
  labelKey: keyof Pick<Strings, "metricYield" | "metricProduction" | "metricArea" | "metricGap">;
  /** Unit the API publishes this column in. UI configuration only. */
  unit: string;
  enabled: boolean;
  /** Set when `enabled` is false, explaining in words why the metric is off. */
  disabledReason?: string | null;
}

/** National crop-series metrics, in display order. */
export const nationalMetrics: MetricOption<NationalMetricId>[] = [
  { id: "yield_mt_ha", labelKey: "metricYield", unit: "MT/ha", enabled: true },
  { id: "production_mt", labelKey: "metricProduction", unit: "MT", enabled: true },
  { id: "harvested_area_ha", labelKey: "metricArea", unit: "ha", enabled: true },
];

/**
 * District cross-section metrics.
 *
 * `gap` is the only metric that must be restricted to periods whose district
 * layer exists, so it carries the dependency explicitly.
 */
export const districtMetrics: MetricOption<DistrictMetricId>[] = [
  { id: "yield_kg_ha", labelKey: "metricYield", unit: "kg/ha", enabled: true },
  { id: "production_mt", labelKey: "metricProduction", unit: "MT", enabled: true },
  { id: "harvested_area_ha", labelKey: "metricArea", unit: "ha", enabled: true },
  { id: "gap", labelKey: "metricGap", unit: "%", enabled: true },
];

/**
 * The display name of a board/panel metric key.
 *
 * One lookup shared by the crop terminal's national selector, its district
 * selector and every "no published …" sentence, so a new metric cannot be named
 * one way in the selector and another in the sentence beside it.
 *
 * The two yield keys deliberately share a label: `yield_mt_ha` (t/ha, national
 * board) and `yield_kg_ha` (kg/ha, district panel) are separate published
 * columns, and the unit beside the label is what distinguishes them.
 */
export function metricLabel(t: Strings, metric: NationalMetricId | DistrictMetricId): string {
  switch (metric) {
    case "yield_mt_ha":
    case "yield_kg_ha":
      return t.metricYield;
    case "production_mt":
      return t.metricProduction;
    case "harvested_area_ha":
      return t.metricArea;
    case "gap":
      return t.metricGap;
  }
}

export interface ResolvedMetricOption<Id extends string> {
  id: Id;
  label: string;
  unit: string;
  enabled: boolean;
  disabledReason?: string | null;
}

/**
 * Turn the config into display-ready options.
 *
 * `units` is the API's own unit map when the response carries one; it wins over
 * the configured unit so a value is never shown under a unit the service did not
 * publish it in.
 */
export function resolveMetricOptions<Id extends string>(
  options: readonly MetricOption<Id>[],
  t: Strings,
  units?: Record<string, string | null | undefined> | null,
): ResolvedMetricOption<Id>[] {
  return options.map((option) => ({
    id: option.id,
    label: t[option.labelKey],
    unit: units?.[option.id] ?? option.unit,
    enabled: option.enabled,
    disabledReason: option.disabledReason ?? null,
  }));
}
