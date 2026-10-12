import type { PracticeObservation } from "@/types";

/**
 * Pure helpers for the multi-period practice panel.
 *
 * The panel reads `GET /analytics/practice-indicators`, whose observations are
 * district-grained rows (plus a smaller set of NATIONAL rows) and whose
 * unfiltered table is far larger than one response. These rules keep the
 * chart honest:
 *
 * * a chart is only built from rows that match the selected geography - the
 *   previous version took the *first* row per indicator x period, which mixed
 *   one arbitrary district's share into an unlabelled "trend";
 * * a release with no published row keeps its slot as `null` and the line is
 *   drawn with `connectNulls={false}`, so a gap never becomes a 0% or a
 *   straight line over data that does not exist;
 * * a published 0 is a real share of zero.
 */

const BASE_LABELS: Record<string, string> = {
  // practice domain (denominator-scoped variants share the base label)
  improved_seed: "Improved seed",
  inorganic_fertilizer: "Inorganic fertiliser",
  organic_fertilizer: "Organic fertiliser",
  pesticide: "Pesticide",
  irrigation: "Irrigation",
  mechanization: "Mechanisation",
  agroforestry: "Agroforestry",
  erosion_protection: "Erosion protection",
  // irrigation techniques
  drip_irrigation: "Drip irrigation",
  flood_irrigation: "Flood irrigation",
  pivot_irrigation: "Pivot irrigation",
  sprinkler_irrigation: "Sprinkler irrigation",
  surface_irrigation: "Surface irrigation",
  traditional_irrigation: "Traditional irrigation",
  // water sources
  rainwater_source: "Rainwater",
  underground_source: "Groundwater",
  lake_stream_source: "Lake or stream",
  water_catchment_source: "Water catchment",
  water_treatment_source: "Water treatment",
  // erosion control methods
  beds_ridges: "Beds and ridges",
  bench_terraces: "Bench terraces",
  cover_plants: "Cover plants",
  ditches: "Ditches",
  mulching: "Mulching",
  progressive_terraces: "Progressive terraces",
  trees_windbreak: "Trees and windbreaks",
  water_channels: "Water channels",
  water_drainage: "Water drainage",
  others: "Other methods",
  erosion_control_adoption: "Erosion control adoption",
  erosion_control_moderate_rate: "Moderate erosion rate",
  erosion_control_severe_rate: "Severe erosion rate",
  // erosion severity bands
  erosion_very_low: "Very low erosion",
  erosion_low: "Low erosion",
  erosion_moderate: "Moderate erosion",
  erosion_severe: "Severe erosion",
};

const BASIS_LABELS: Record<string, string> = {
  farmers: "of farmers",
  land: "of land",
  plots: "of plots",
};

export const PRACTICE_DOMAIN_LABELS: Record<string, string> = {
  practice: "Agricultural practices",
  irrigation: "Irrigation",
  water_source: "Water sources",
  erosion_control: "Erosion control",
  erosion_severity: "Erosion severity",
};

/**
 * Human label for a published indicator code. Codes the release has not
 * published a label for fall back to the raw code - ugly but honest, where a
 * guessed translation would read as authoritative.
 */
export function practiceIndicatorLabel(code: string): string {
  const match = code.match(/^(.+?)(?:_(farmers|land|plots|pct))?$/);
  const base = match?.[1] ?? code;
  const suffix = match?.[2] ?? "";
  const label = BASE_LABELS[base];
  if (!label) return code.replace(/_/g, " ");
  if (suffix === "pct" || !suffix) return label;
  const basis = BASIS_LABELS[suffix];
  return basis ? `${label} ${basis}` : label;
}

export interface PracticeSeriesPoint {
  period: string;
  value: number | null;
}

export interface PracticeSeries {
  code: string;
  label: string;
  points: PracticeSeriesPoint[];
}

/**
 * One series per indicator for the selected geography, across the releases
 * the response reports for the domain.
 *
 * `district` is required for a district-grained chart: without it the
 * endpoint returns an arbitrary page of the full table and any aggregation
 * the client performed would be an invented statistic. Callers pass `null`
 * to request national rows only (`geography_level === "NATIONAL"`), which
 * are published as published.
 */
export function buildPracticeSeries(
  observations: PracticeObservation[],
  periods: string[],
  district: string | null,
): PracticeSeries[] {
  const scoped = district
    ? observations.filter((row) => row.district === district)
    : observations.filter((row) => row.geography_level === "NATIONAL");
  const codes = [...new Set(scoped.map((row) => row.indicator_code))].sort();
  const orderedPeriods = [...periods].sort((a, b) => a.localeCompare(b));
  return codes.map((code) => ({
    code,
    label: practiceIndicatorLabel(code),
    points: orderedPeriods.map((period) => {
      const hit = scoped.find(
        (row) => row.indicator_code === code && row.period_code === period,
      );
      return { period, value: hit ? (hit.value ?? null) : null };
    }),
  }));
}

/** The published span of a period list, e.g. "2024A-2026B". */
export function practiceSpan(periods: string[]): string | null {
  if (!periods.length) return null;
  const ordered = [...periods].sort((a, b) => a.localeCompare(b));
  return `${ordered[0]}-${ordered[ordered.length - 1]}`;
}
