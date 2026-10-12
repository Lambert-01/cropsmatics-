import type { PracticeObservation } from "../types";
import type { Strings } from "../i18n";

/**
 * Pure selectors over `GET /analytics/practice-indicators`
 * (district shares for practices, irrigation, water source, erosion control
 * and erosion severity, 2024A-2026B).
 *
 * The rules match the rest of the app's history panels exactly:
 *
 * * a release with no published row keeps its slot as `null`, so the chart
 *   draws a gap instead of bridging data that never existed;
 * * a published `0` is a real share of zero and is rendered as `0`, never
 *   dropped and never confused with a gap;
 * * releases are ordered by their own codes, never by arrival order;
 * * the dataset is district-grained, so a chart is only ever built for one
 *   named district - a national line would require an aggregate this client
 *   is not allowed to invent.
 */

/** The five published domains, in reading order, with their i18n keys. */
export const PRACTICE_DOMAINS: { domain: string; key: keyof Strings }[] = [
  { domain: "practice", key: "domainPractices" },
  { domain: "irrigation", key: "domainIrrigation" },
  { domain: "water_source", key: "domainWaterSource" },
  { domain: "erosion_control", key: "domainErosionControl" },
  { domain: "erosion_severity", key: "domainErosionSeverity" },
];

/**
 * Indicator label keys, by code. Codes the release has not published a label
 * for fall back to the raw code in the UI - a raw code is ugly but honest,
 * where a guessed translation would read as authoritative.
 */
const INDICATOR_KEYS: Record<string, keyof Strings> = {
  // practice domain: the base practice plus the denominator it was published for
  improved_seed_farmers: "improvedSeed",
  improved_seed_land: "improvedSeed",
  improved_seed_plots: "improvedSeed",
  inorganic_fertilizer_farmers: "inorganicFertilizer",
  inorganic_fertilizer_land: "inorganicFertilizer",
  inorganic_fertilizer_plots: "inorganicFertilizer",
  organic_fertilizer_farmers: "organicFertilizer",
  organic_fertilizer_land: "organicFertilizer",
  organic_fertilizer_plots: "organicFertilizer",
  pesticide_farmers: "pesticide",
  pesticide_land: "pesticide",
  pesticide_plots: "pesticide",
  irrigation_farmers: "irrigation",
  mechanization_farmers: "mechanization",
  agroforestry_farmers: "agroforestry",
  erosion_protection_farmers: "erosionProtection",
  // irrigation techniques
  drip_irrigation_pct: "dripIrrigation",
  flood_irrigation_pct: "floodIrrigation",
  pivot_irrigation_pct: "pivotIrrigation",
  sprinkler_irrigation_pct: "sprinklerIrrigation",
  surface_irrigation_pct: "surfaceIrrigation",
  traditional_irrigation_pct: "traditionalIrrigation",
  // water sources
  rainwater_source_pct: "rainwaterSource",
  underground_source_pct: "undergroundSource",
  lake_stream_source_pct: "lakeStreamSource",
  water_catchment_source_pct: "waterCatchmentSource",
  water_treatment_source_pct: "waterTreatmentSource",
  // erosion control methods
  beds_ridges_pct: "bedsRidges",
  bench_terraces_pct: "benchTerraces",
  cover_plants_pct: "coverPlants",
  ditches_pct: "ditches",
  mulching_pct: "mulching",
  progressive_terraces_pct: "progressiveTerraces",
  trees_windbreak_pct: "treesWindbreak",
  water_channels_pct: "waterChannels",
  water_drainage_pct: "waterDrainage",
  others_pct: "erosionOther",
  erosion_control_adoption_pct: "erosionControlAdoption",
  erosion_control_moderate_rate_pct: "erosionModerateRate",
  erosion_control_severe_rate_pct: "erosionSevereRate",
  // erosion severity bands
  erosion_very_low_pct: "erosionVeryLow",
  erosion_low_pct: "erosionLow",
  erosion_moderate_pct: "erosionModerate",
  erosion_severe_pct: "erosionSevere",
};

/** The denominator a practice-domain code was published for, if any. */
const BASIS_KEYS: Record<string, keyof Strings> = {
  farmers: "basisFarmers",
  land: "basisLand",
  plots: "basisPlots",
};

/** The i18n key for an indicator's base label, or null for an unknown code. */
export function indicatorLabelKey(code: string): keyof Strings | null {
  return INDICATOR_KEYS[code] ?? null;
}

/**
 * The i18n key for a code's denominator suffix (`_farmers`, `_land`,
 * `_plots`), or null when the indicator is not denominator-scoped.
 */
export function indicatorBasisKey(code: string): keyof Strings | null {
  const suffix = code.split("_").pop() ?? "";
  return BASIS_KEYS[suffix] ?? null;
}

/** The i18n key for a published domain, or null for an unknown domain. */
export function domainLabelKey(domain: string): keyof Strings | null {
  return PRACTICE_DOMAINS.find((item) => item.domain === domain)?.key ?? null;
}

/** Chronological order of the published codes (2024A < 2024B < ... < 2026B). */
export function sortPracticePeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => a.localeCompare(b));
}

/** The published span of a period list, for a coverage note. */
export function practiceCoverage(periods: string[]): { first: string; last: string } | null {
  const sorted = sortPracticePeriods(periods);
  if (!sorted.length) return null;
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

export interface PracticePoint {
  period: string;
  value: number | null;
}

/**
 * One indicator for one district across every release it was published for.
 *
 * Every requested release keeps its slot: a release with nothing published for
 * this district holds `null`, so the chart draws a gap instead of contracting
 * its axis or bridging the gap with a line that never happened.
 */
export function districtIndicatorSeries(
  observations: PracticeObservation[],
  district: string,
  indicator: string,
  periods: string[],
): PracticePoint[] {
  const byPeriod = new Map<string, number | null>();
  for (const row of observations) {
    if ((row.district ?? "") !== district) continue;
    if (row.indicator_code !== indicator) continue;
    byPeriod.set(row.period_code, row.value);
  }
  return sortPracticePeriods(periods).map((period) => ({
    period,
    value: byPeriod.has(period) ? (byPeriod.get(period) as number | null) : null,
  }));
}

/**
 * The indicator codes this district has anything published for in this domain,
 * in canonical reading order; unknown codes follow alphabetically.
 */
export function districtIndicators(
  observations: PracticeObservation[],
  district: string,
  domain: string,
): string[] {
  const present = new Set<string>();
  for (const row of observations) {
    if ((row.district ?? "") !== district) continue;
    if (row.domain !== domain) continue;
    if (row.value !== null && row.value !== undefined) present.add(row.indicator_code);
  }
  const known = Object.keys(INDICATOR_KEYS)
    .filter((code) => present.has(code))
    .sort();
  const unknown = [...present].filter((code) => !(code in INDICATOR_KEYS)).sort();
  return [...known, ...unknown];
}

/** The districts present in the slice, alphabetically, that carry any value. */
export function observedDistricts(observations: PracticeObservation[]): string[] {
  const present = new Set<string>();
  for (const row of observations) {
    if (row.district && row.value !== null && row.value !== undefined) present.add(row.district);
  }
  return [...present].sort();
}
