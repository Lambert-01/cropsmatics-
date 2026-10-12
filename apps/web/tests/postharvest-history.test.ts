import { describe, expect, it } from "vitest";

import {
  availableIndicators,
  compositionFor,
  cropRanking,
  indicatorSeries,
  phIndicatorLabel,
  shareFlag,
  sortPeriods,
} from "@/lib/postharvestHistory";
import type { PostharvestHistoryObservation, PostharvestShareTotal } from "@/types";

function obs(
  crop: string,
  period: string,
  indicator_code: string,
  value: number | null,
): PostharvestHistoryObservation {
  return { crop, period_code: period, indicator_code, value };
}

const OBSERVATIONS: PostharvestHistoryObservation[] = [
  obs("Maize", "2025A", "sold_pct", 41.5),
  obs("Maize", "2025A", "own_consumption_pct", 30.2),
  obs("Maize", "2025A", "post_harvest_losses_pct", 4.1),
  obs("Maize", "2025A", "stored_pct", null),
  obs("Maize", "2025B", "sold_pct", 44.0),
  obs("Maize", "2026B", "sold_pct", 46.2),
  obs("Beans", "2025A", "sold_pct", 61.0),
];

describe("sortPeriods", () => {
  it("orders the published codes chronologically, not by arrival", () => {
    expect(sortPeriods(["2026B", "2024A", "2025C", "2024B"])).toEqual([
      "2024A",
      "2024B",
      "2025C",
      "2026B",
    ]);
  });

  it("does not mutate its input", () => {
    const periods = ["2025B", "2024A"];
    sortPeriods(periods);
    expect(periods).toEqual(["2025B", "2024A"]);
  });
});

describe("compositionFor", () => {
  it("keeps only the selected crop and release", () => {
    const rows = compositionFor(OBSERVATIONS, "Maize", "2025A");
    expect(rows.map((row) => row.indicator_code)).toEqual([
      "sold_pct",
      "own_consumption_pct",
      "post_harvest_losses_pct",
    ]);
  });

  it("reads largest share first", () => {
    const rows = compositionFor(OBSERVATIONS, "Maize", "2025A");
    expect(rows[0]).toEqual({ indicator_code: "sold_pct", label: "Sold", value: 41.5 });
    expect(rows.map((row) => row.value)).toEqual([41.5, 30.2, 4.1]);
  });

  it("drops a share that was never published instead of rendering it as 0%", () => {
    const rows = compositionFor(OBSERVATIONS, "Maize", "2025A");
    expect(rows.some((row) => row.indicator_code === "stored_pct")).toBe(false);
    expect(rows.some((row) => row.value === 0)).toBe(false);
  });

  it("keeps an explicitly published zero as a value", () => {
    const rows = compositionFor([obs("Maize", "2025A", "gift_pct", 0)], "Maize", "2025A");
    expect(rows).toEqual([{ indicator_code: "gift_pct", label: "Given away", value: 0 }]);
  });

  it("returns nothing for a group the panel does not cover", () => {
    expect(compositionFor(OBSERVATIONS, "Maize", "2026A")).toEqual([]);
    expect(compositionFor(OBSERVATIONS, "Cassava", "2025A")).toEqual([]);
    expect(compositionFor([], "Maize", "2025A")).toEqual([]);
  });
});

describe("indicatorSeries", () => {
  it("returns every requested release in chronological order", () => {
    const series = indicatorSeries(
      OBSERVATIONS,
      "Maize",
      "sold_pct",
      ["2024A", "2025A", "2025B", "2026B"],
    );
    expect(series).toEqual([
      { period: "2024A", value: null },
      { period: "2025A", value: 41.5 },
      { period: "2025B", value: 44.0 },
      { period: "2026B", value: 46.2 },
    ]);
  });

  it("keeps a gap as null so the line does not bridge missing releases", () => {
    const series = indicatorSeries(
      OBSERVATIONS,
      "Maize",
      "sold_pct",
      ["2025A", "2026B"],
    );
    expect(series).toEqual([
      { period: "2025A", value: 41.5 },
      { period: "2026B", value: 46.2 },
    ]);
    expect(series.map((point) => point.value)).not.toContain(0);
  });

  it("never substitutes another crop's value", () => {
    const series = indicatorSeries(OBSERVATIONS, "Beans", "sold_pct", ["2025A", "2025B"]);
    expect(series).toEqual([
      { period: "2025A", value: 61.0 },
      { period: "2025B", value: null },
    ]);
  });
});

describe("cropRanking", () => {
  it("ranks the published values largest first", () => {
    const ranking = cropRanking(OBSERVATIONS, "2025A", "sold_pct");
    expect(ranking).toEqual([
      { crop: "Beans", value: 61.0 },
      { crop: "Maize", value: 41.5 },
    ]);
  });

  it("omits a crop with nothing published rather than ranking it last", () => {
    const ranking = cropRanking(
      [obs("Beans", "2025A", "sold_pct", 61), obs("Maize", "2025A", "sold_pct", null)],
      "2025A",
      "sold_pct",
    );
    expect(ranking).toEqual([{ crop: "Beans", value: 61 }]);
    expect(ranking).toHaveLength(1);
  });

  it("returns nothing when the indicator is absent from the release", () => {
    expect(cropRanking(OBSERVATIONS, "2026A", "sold_pct")).toEqual([]);
  });
});

describe("shareFlag", () => {
  const totals: PostharvestShareTotal[] = [
    { period_code: "2024A", crop: "Banana", shares_sum_pct: 300.0, shares_sum_ok: false },
    { period_code: "2026B", crop: "Maize", shares_sum_pct: 99.99999, shares_sum_ok: true },
  ];

  it("reports a group that does not total 100 as flagged, still with its published sum", () => {
    expect(shareFlag(totals, "Banana", "2024A")).toEqual({
      shares_sum_pct: 300.0,
      shares_sum_ok: false,
    });
  });

  it("reports a group within tolerance as passing", () => {
    expect(shareFlag(totals, "Maize", "2026B")).toEqual({
      shares_sum_pct: 99.99999,
      shares_sum_ok: true,
    });
  });

  it("says 'not checked' rather than 'fine' when no total was published", () => {
    expect(shareFlag(totals, "Beans", "2025A")).toBeNull();
    expect(shareFlag([], "Maize", "2026B")).toBeNull();
  });
});

describe("availableIndicators", () => {
  it("lists the published indicators in reading order, then any extras", () => {
    const available = availableIndicators([
      obs("Maize", "2025A", "stored_pct", 1),
      obs("Maize", "2025A", "sold_pct", 2),
      obs("Maize", "2025A", "z_custom_pct", 3),
    ]);
    expect(available).toEqual(["sold_pct", "stored_pct", "z_custom_pct"]);
  });

  it("is empty when nothing is published", () => {
    expect(availableIndicators([])).toEqual([]);
  });
});

describe("phIndicatorLabel", () => {
  it("reads the published code as a human label", () => {
    expect(phIndicatorLabel("post_harvest_losses_pct")).toBe("Post-harvest losses");
    expect(phIndicatorLabel("hired_labour_wages_pct")).toBe("Hired labour wages");
  });

  it("degrades to a readable form for a code it does not know", () => {
    expect(phIndicatorLabel("maize_quality_pct")).toBe("maize quality");
  });
});
