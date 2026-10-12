import { describe, expect, it } from "vitest";

import {
  availableHistoryIndicators,
  historySeries,
  historyShareFlag,
  HISTORY_INDICATORS,
  sortHistoryPeriods,
} from "../src/utils/postharvestHistory";
import type { PostHarvestHistoryObservation, PostHarvestShareTotal } from "../src/types";

function obs(
  crop: string,
  period_code: string,
  indicator_code: string,
  value: number | null,
): PostHarvestHistoryObservation {
  return {
    period_code,
    year: null,
    season: null,
    crop,
    canonical_crop_name: crop,
    indicator_code,
    value,
    unit: "percent",
    shares_sum_pct: null,
    shares_sum_ok: null,
  };
}

const OBSERVATIONS: PostHarvestHistoryObservation[] = [
  obs("Maize", "2025A", "sold_pct", 41.5),
  obs("Maize", "2025A", "stored_pct", 12.0),
  obs("Maize", "2025A", "own_consumption_pct", null),
  obs("Maize", "2025B", "sold_pct", 44.0),
  obs("Maize", "2026B", "sold_pct", 46.2),
  obs("Beans", "2025A", "sold_pct", 61.0),
];

describe("sortHistoryPeriods", () => {
  it("orders the published codes chronologically", () => {
    expect(sortHistoryPeriods(["2026B", "2024A", "2025C", "2024B"])).toEqual([
      "2024A",
      "2024B",
      "2025C",
      "2026B",
    ]);
  });
});

describe("historySeries", () => {
  it("returns every requested release in chronological order", () => {
    expect(historySeries(OBSERVATIONS, "Maize", "sold_pct", ["2025A", "2025B", "2026B"])).toEqual([
      { period: "2025A", value: 41.5 },
      { period: "2025B", value: 44.0 },
      { period: "2026B", value: 46.2 },
    ]);
  });

  it("keeps an unpublished release as a gap rather than 0", () => {
    const series = historySeries(OBSERVATIONS, "Maize", "sold_pct", ["2024A", "2025A"]);
    expect(series).toEqual([
      { period: "2024A", value: null },
      { period: "2025A", value: 41.5 },
    ]);
    expect(series.map((point) => point.value)).not.toContain(0);
  });

  it("keeps a published null as a gap too", () => {
    const series = historySeries(OBSERVATIONS, "Maize", "own_consumption_pct", ["2025A"]);
    expect(series).toEqual([{ period: "2025A", value: null }]);
  });

  it("never borrows another crop's value", () => {
    expect(historySeries(OBSERVATIONS, "Beans", "sold_pct", ["2025A", "2025B"])).toEqual([
      { period: "2025A", value: 61.0 },
      { period: "2025B", value: null },
    ]);
  });
});

describe("availableHistoryIndicators", () => {
  it("offers the shares that crop has something published for", () => {
    expect(availableHistoryIndicators(OBSERVATIONS, "Maize")).toEqual(["sold_pct", "stored_pct"]);
  });

  it("offers nothing when the crop has no published share at all", () => {
    expect(availableHistoryIndicators(OBSERVATIONS, "Cassava")).toEqual([]);
    expect(availableHistoryIndicators([], "Maize")).toEqual([]);
  });

  it("keeps the offered order, not the order the data arrived in", () => {
    expect(availableHistoryIndicators(OBSERVATIONS, "Maize")).not.toEqual([
      "stored_pct",
      "sold_pct",
    ]);
  });

  it("only offers shares this screen has an i18n label for", () => {
    const offered = availableHistoryIndicators(OBSERVATIONS, "Maize");
    const known = HISTORY_INDICATORS.map((item) => item.code);
    expect(offered.every((code) => known.includes(code))).toBe(true);
  });
});

describe("historyShareFlag", () => {
  const totals: PostHarvestShareTotal[] = [
    { period_code: "2024A", crop: "Banana", shares_sum_pct: 300.0, shares_sum_ok: false },
    { period_code: "2026B", crop: "Maize", shares_sum_pct: 99.99999, shares_sum_ok: true },
  ];

  it("reports a group outside tolerance as flagged, keeping its published sum", () => {
    expect(historyShareFlag(totals, "Banana", "2024A")).toEqual({
      shares_sum_pct: 300.0,
      shares_sum_ok: false,
    });
  });

  it("reports a group within tolerance as passing", () => {
    expect(historyShareFlag(totals, "Maize", "2026B")).toEqual({
      shares_sum_pct: 99.99999,
      shares_sum_ok: true,
    });
  });

  it("returns null when no total was published for that group", () => {
    expect(historyShareFlag(totals, "Beans", "2025A")).toBeNull();
    expect(historyShareFlag([], "Maize", "2026B")).toBeNull();
  });
});
