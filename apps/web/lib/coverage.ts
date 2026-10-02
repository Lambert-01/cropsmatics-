/**
 * Data-coverage helpers.
 *
 * The product rule: when a selection has no district rows, the UI must say it is
 * showing national statistics rather than rendering district estimates. Keeping
 * the decision in a pure function makes it testable and keeps the wording in one
 * place.
 */

export type CoverageMode = "district" | "national" | "national_crop" | "unknown";

export const COVERAGE_MODES: CoverageMode[] = ["district", "national", "national_crop", "unknown"];

/** Map a coverage level from `/meta/data-coverage` to a display mode. */
export function coverageMode(level?: string | null): CoverageMode {
  const normalised = (level ?? "").trim().toLowerCase();
  if (normalised === "district") return "district";
  if (normalised === "national") return "national";
  if (normalised === "national_crop") return "national_crop";
  return "unknown";
}

/** True when the UI should warn that district estimates are unavailable. */
export function needsNationalContextNotice(level?: string | null): boolean {
  const mode = coverageMode(level);
  return mode !== "district";
}

/** The exact notice text for a mode, or null when no notice is needed. */
export function coverageNotice(mode: CoverageMode, period?: string | null): string | null {
  const label = period ? period : "this period";
  switch (mode) {
    case "district":
      return null;
    case "national":
    case "national_crop":
      return `District-level data are not available for ${label}. Showing national statistics only — no district estimates are fabricated.`;
    default:
      return `Coverage for ${label} is not confirmed by the pipeline. Showing national statistics only — no district estimates are fabricated.`;
  }
}

/** Short badge label for a coverage mode. */
export function coverageBadge(mode: CoverageMode): string {
  switch (mode) {
    case "district":
      return "DISTRICT DATA";
    case "national_crop":
      return "NATIONAL (CROP LEVEL)";
    case "national":
      return "NATIONAL ONLY";
    default:
      return "COVERAGE UNKNOWN";
  }
}

/**
 * One row of `/meta/data-coverage.details`.
 *
 * Typed loosely on purpose: the endpoint returns a tabular row, so only the
 * fields the coverage statements actually rely on are named.
 */
export interface CoverageDetailRow {
  dataset?: string | null;
  period?: string | null;
  coverage_level?: string | null;
  n_districts?: string | number | null;
  n_crops?: string | number | null;
}

/** Canonical sort key for a period key: `"2026A"` -> `"2026:A"`. */
function periodSortKey(period: string): string {
  const match = /^(\d{4})\s*([ABC])$/i.exec(period.trim());
  return match ? `${match[1]}:${match[2].toUpperCase()}` : `9999:${period}`;
}

/** Period keys in canonical year-then-season order, de-duplicated. */
export function sortPeriods(periods: Iterable<string>): string[] {
  return [...new Set(periods)].sort((a, b) => periodSortKey(a).localeCompare(periodSortKey(b)));
}

/** `"2024A–2026B"` for a run of periods, or the single key when there is one. */
export function periodSpan(periods: Iterable<string>): string {
  const sorted = sortPeriods(periods);
  if (sorted.length === 0) return "—";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]}–${sorted[sorted.length - 1]}`;
}

/**
 * Limitations describing the coverage matrix itself, generated from the live
 * `/meta/data-coverage` rows.
 *
 * This exists because the hand-written version silently went stale: it claimed
 * district-level data existed only for one season while the pipeline was
 * already publishing eight. A statement derived from the coverage rows cannot
 * contradict them, and a level the pipeline never stated is never claimed.
 */
export function coverageLimitations(details: CoverageDetailRow[]): string[] {
  const districtPeriods = new Map<string, Set<string>>();
  const nationalPeriods = new Map<string, Set<string>>();

  for (const row of details) {
    const dataset = String(row.dataset ?? "").trim();
    const period = String(row.period ?? "").trim();
    if (!dataset || !period) continue;
    const mode = coverageMode(row.coverage_level);
    if (mode === "unknown") continue;
    const target = mode === "district" ? districtPeriods : nationalPeriods;
    const periods = target.get(dataset) ?? new Set<string>();
    periods.add(period);
    target.set(dataset, periods);
  }

  const lines: string[] = [];
  const byBreadth = [...districtPeriods.entries()].sort(
    (a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]),
  );
  const multiPeriod = byBreadth.filter(([, periods]) => periods.size > 1);
  const singlePeriod = byBreadth.filter(([, periods]) => periods.size === 1);

  if (multiPeriod.length > 0) {
    lines.push(
      `District-level data are published for ${multiPeriod
        .map(([dataset, periods]) => `${dataset} (${periodSpan(periods)})`)
        .join(", ")}.`,
    );
  }
  if (singlePeriod.length > 0) {
    lines.push(
      `District-level data exist for ${periodSpan(
        singlePeriod.flatMap(([, periods]) => [...periods]),
      )} only for ${singlePeriod.map(([dataset]) => dataset).join(", ")}.`,
    );
  }

  // Only datasets that never carry district rows are called national series; a
  // dataset with both levels must not be described as national-only.
  const nationalOnly = [...nationalPeriods.keys()]
    .filter((dataset) => !districtPeriods.has(dataset))
    .sort();
  if (nationalOnly.length > 0) {
    lines.push(
      `These are national series only, and no district estimate is derived from them: ${nationalOnly.join(
        ", ",
      )}.`,
    );
  }

  return lines;
}
