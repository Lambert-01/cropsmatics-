/** Presentation-only formatting helpers. These never compute analytics values. */

export type NumberGrouping = "grouped" | "plain";

/**
 * Thousands-separator preference.
 *
 * `fmtNumber` is a pure helper called from dozens of components and tables, so
 * the preference is held as one synced value here instead of being threaded
 * through every call site as a prop. `PreferencesProvider` is the only writer,
 * and it sets this whenever the stored preference changes.
 */
let numberGrouping: NumberGrouping = "grouped";

export function setNumberGroupingPreference(value: NumberGrouping): void {
  numberGrouping = value;
}

export function getNumberGroupingPreference(): NumberGrouping {
  return numberGrouping;
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: numberGrouping === "grouped",
  });
}

export function fmtCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Turn a "2025B" period key into a readable "2025 Season B" label. */
export function periodLabel(period: string | null | undefined): string {
  if (!period) return "—";
  const match = /^(\d{4})([ABC])$/.exec(period.trim());
  if (match) return `${match[1]} Season ${match[2]}`;
  return period;
}

export const BENCHMARK_LABELS: Record<string, string> = {
  national_crop_median: "National crop median",
  national_crop_season_median: "National crop-season median",
  top_quartile_comparable_districts: "Top-quartile comparable districts",
  agro_ecological_peer_group: "Agro-ecological peer group",
};

export function benchmarkLabel(strategy: string | null | undefined): string {
  if (!strategy) return "—";
  return BENCHMARK_LABELS[strategy] ?? strategy.replace(/_/g, " ");
}
