/**
 * The units the canonical district panel publishes its columns in.
 *
 * Mirrors `productivity_service.UNITS` on the API. It exists because the
 * `/productivity` window returns rows without a unit map, and a value must
 * never be rendered without the unit it was published in. The national series
 * endpoint (`/analytics/trends`) returns its own `metric_units`, and that one is
 * always preferred where it is available.
 *
 * `yield_kg_ha` (kg/ha) and `yield_mt_ha` (t/ha) are different columns of
 * different datasets. They are never relabelled into one another; converting
 * between them is `kgPerHaToTonnesPerHa` in `utils/units.ts`.
 */
export const PANEL_UNITS = {
  cultivated_area_ha: "ha",
  harvested_area_ha: "ha",
  production_mt: "metric tonnes",
  yield_kg_ha: "kg/ha",
} as const;

export type PanelMetric = keyof typeof PANEL_UNITS;
