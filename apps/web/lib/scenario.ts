/**
 * Presentation helpers for the Yield Scenario Lab.
 *
 * These are formatting and selection helpers only — no agricultural value is
 * computed in the browser. Every number a scenario shows comes from the API, so
 * this module can never disagree with the backend.
 */

import { BENCHMARK_OPTIONS } from "@/lib/filters";
import { benchmarkLabel, fmtNumber, periodLabel } from "@/lib/format";

export interface RankingCriterionOption {
  id: string;
  label: string;
  unit?: string | null;
  note?: string | null;
}

/**
 * Used only until the API answers with its own (authoritative) criterion list.
 * The backend validates every value regardless, so this can never make an
 * unsupported criterion work.
 */
export const FALLBACK_RANKING_CRITERIA: RankingCriterionOption[] = [
  { id: "gap_index", label: "Yield gap index", unit: "%" },
  { id: "yield_kg_ha", label: "Observed yield", unit: "kg/ha" },
  { id: "production_mt", label: "Production", unit: "metric tonnes" },
  { id: "harvested_area_ha", label: "Harvested area", unit: "ha" },
];

export function scenarioCriteria(
  fromApi?: RankingCriterionOption[] | null,
): RankingCriterionOption[] {
  return fromApi?.length ? fromApi : FALLBACK_RANKING_CRITERIA;
}

/**
 * The period to compare against: the same season one year earlier when it is
 * published (2026B -> 2025B), otherwise the preceding published period.
 *
 * Seasons differ agronomically, so the same-season comparison is the meaningful
 * default. Falling back to the preceding release keeps the control usable
 * instead of defaulting to the baseline period, which would compare a period
 * with itself and show no change at all.
 *
 * Returns ``""`` when nothing earlier was published. That is a real state — the
 * earliest release has no earlier period to compare against — and the caller
 * must show it as "no comparison available" rather than quietly comparing the
 * period with a later one.
 */
export function previousPeriod(periods: string[], current?: string): string {
  if (!periods.length) return "";
  if (!current) return periods[periods.length - 2] ?? periods[0] ?? "";

  const needle = current.trim().toUpperCase();
  const match = /^(\d{4})([ABC])$/.exec(needle);
  if (match) {
    const sameSeason = `${Number(match[1]) - 1}${match[2]}`;
    if (periods.includes(sameSeason)) return sameSeason;
  }

  const index = periods.indexOf(needle);
  return index > 0 ? periods[index - 1] : "";
}

/** Render a changed parameter in the user's vocabulary, not the API's. */
export function formatScenarioValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "all";
  if (typeof value === "number") return fmtNumber(value, 1);
  const text = String(value);
  if (BENCHMARK_OPTIONS.some((option) => option.value === text)) return benchmarkLabel(text);
  if (/^\d{4}[ABC]$/.test(text)) return periodLabel(text);
  return text;
}

/** How a rank movement reads, given the two ranks it connects. */
export function movementLabel(movement: number | null): string {
  if (movement === null || movement === undefined) return "not comparable";
  if (movement > 0) return `moved up ${movement}`;
  if (movement < 0) return `moved down ${Math.abs(movement)}`;
  return "held position";
}
