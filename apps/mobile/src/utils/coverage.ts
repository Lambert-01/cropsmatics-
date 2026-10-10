/**
 * Coverage rules, derived from what the API actually publishes.
 *
 * This is the module that stops the app from colouring a map, or drawing a
 * district trend, for a period that does not carry the underlying data. It
 * reads `/meta/periods`, which is assembled from the processed tables, so a
 * period can only be offered because rows genuinely exist for it.
 *
 * Verified against the current build:
 * - `crop_productivity` carries district rows for every published period
 *   (2024A-2026B), so yield / gap / priority maps and district trends are
 *   available for all of them.
 * - `district_factors`, `irrigation_water` and `erosion_control` are single
 *   release tables (2025 Season B only), so the adoption layers exist for
 *   exactly one period.
 */

import type { PeriodInfo } from "../types";

export type MapLayer =
  | "yield"
  | "gap"
  | "priority"
  | "input_adoption"
  | "irrigation"
  | "erosion";

/** Layers whose values live in a single-release district table. */
const SINGLE_RELEASE_LAYERS: Partial<Record<MapLayer, string>> = {
  input_adoption: "district_factors",
  irrigation: "irrigation_water",
  erosion: "erosion_control",
};

/** Layers whose value is a raw crop yield: a crop selection is mandatory. */
export function layerRequiresCrop(layer: MapLayer): boolean {
  return layer === "yield";
}

/** The datasets that carry a district-level value for a layer. */
export function datasetsForLayer(layer: MapLayer): string[] {
  const single = SINGLE_RELEASE_LAYERS[layer];
  return single ? [single] : ["crop_productivity", "district_crop_productivity"];
}

/**
 * Published periods that genuinely carry this layer.
 *
 * A period with no `datasets` list (an older API build) is judged on its
 * coverage level alone, which is the conservative reading: an unlisted period
 * is only offered when it is described as district coverage.
 */
export function periodsCarryingLayer(periods: PeriodInfo[], layer: MapLayer): PeriodInfo[] {
  const single = SINGLE_RELEASE_LAYERS[layer];
  if (single) {
    return periods.filter((period) =>
      (period.datasets ?? []).some((dataset) => dataset.dataset === single),
    );
  }
  return periods.filter(
    (period) => period.coverage_level === "district" || period.n_districts > 0,
  );
}

export interface PeriodLinkDecision {
  /** The period the map should use, or null when it cannot follow the chart. */
  periodCode: string | null;
  /**
   * Unlocalized explanation, kept for logs and tests. Screens must compose the
   * user-facing sentence from `reasonCode` + `reasonPeriods` through i18n.
   */
  reason: string | null;
  /** Machine-readable reason so a screen can localize the sentence. */
  reasonCode: "none" | "not-district" | "no-period" | null;
  /** Published labels the localized sentence needs. */
  reasonPeriods: { requested: string | null; fallback: string | null };
}

/**
 * Decide whether a map can follow a period selected on a national chart.
 *
 * A national chart is published for periods a district layer may not cover, so
 * silently reusing the chart's period would colour the map with a period the
 * user did not choose. When the layer does not cover the period the map stays
 * on its own selection and says why.
 */
export function linkPeriodToLayer(
  periods: PeriodInfo[],
  layer: MapLayer,
  chartPeriod: string | null,
): PeriodLinkDecision {
  if (!chartPeriod) {
    return { periodCode: null, reason: null, reasonCode: null, reasonPeriods: { requested: null, fallback: null } };
  }
  const allowed = periodsCarryingLayer(periods, layer);
  const requestedLabel = labelOf(periods, chartPeriod);
  if (allowed.some((period) => period.period_code === chartPeriod)) {
    return {
      periodCode: chartPeriod,
      reason: null,
      reasonCode: null,
      reasonPeriods: { requested: requestedLabel, fallback: null },
    };
  }
  const fallback = allowed[allowed.length - 1]?.period_code ?? null;
  const fallbackLabel = labelOf(periods, fallback);
  if (allowed.length === 0) {
    return {
      periodCode: null,
      reason: `No published period carries this layer.`,
      reasonCode: "no-period",
      reasonPeriods: { requested: requestedLabel, fallback: null },
    };
  }
  return {
    periodCode: fallback,
    reason: `${requestedLabel} is not published at district level for this indicator, so the map stays on ${fallbackLabel}.`,
    reasonCode: "not-district",
    reasonPeriods: { requested: requestedLabel, fallback: fallbackLabel },
  };
}

function labelOf(periods: PeriodInfo[], code: string | null): string {
  if (!code) return "—";
  return periods.find((period) => period.period_code === code)?.label ?? code;
}

/**
 * Turn a release identifier such as ``2025-B`` into the published period label.
 *
 * Single-release endpoints report their release as ``YYYY-S`` while the period
 * catalogue uses ``YYYYS``. Rather than writing "2025 Season B" into a screen,
 * the code is normalised and looked up, and an unknown release passes through
 * unchanged so it is still shown honestly.
 */
export function releaseLabel(
  sourcePeriod: string | null | undefined,
  periods: PeriodInfo[],
): string | null {
  if (!sourcePeriod) return null;
  const code = String(sourcePeriod).replace(/[^0-9A-Ca-c]/g, "").toUpperCase();
  const match = periods.find((period) => period.period_code === code);
  return match?.label ?? sourcePeriod;
}

/** The newest published district period, or null when none exists. */
export function latestDistrictPeriod(periods: PeriodInfo[]): PeriodInfo | null {
  const district = periods.filter(
    (period) => period.coverage_level === "district" || period.n_districts > 0,
  );
  if (district.length) return district[district.length - 1];
  return periods.find((period) => period.is_latest_district) ?? null;
}
