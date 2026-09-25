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
