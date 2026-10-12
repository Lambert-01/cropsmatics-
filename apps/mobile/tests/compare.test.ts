import { describe, expect, it } from "vitest";
import { canCompare, filterByLabel, isSelectionFull, toggleSelection, EMPTY_COMPARE_SELECTION, mergeCompareSelection, parseParamList, CompareSelection } from "../src/utils/selection";
import { slugifyEntity } from "../src/utils/slug";
import { alignIndexedSeries, alignToPeriodAxis, indexByPeriod, unionPeriods, type PeriodKeyedSeries } from "../src/utils/analytics";

// merged from comparison-selection.test.ts
describe("toggleSelection", () => {
  it("adds an entity that is not selected", () => {
    expect(toggleSelection(["Maize"], "Beans", 5)).toEqual(["Maize", "Beans"]);
  });

  it("removes an entity that is already selected", () => {
    expect(toggleSelection(["Maize", "Beans"], "Maize", 5)).toEqual(["Beans"]);
  });

  it("ignores an extra tap at the maximum instead of evicting a choice", () => {
    const full = ["A", "B", "C", "D", "E"];
    // The user tapped F while 5 are selected: nothing is dropped silently.
    expect(toggleSelection(full, "F", 5)).toEqual(full);
  });

  it("still allows de-selection while full", () => {
    const full = ["A", "B", "C", "D", "E"];
    expect(toggleSelection(full, "C", 5)).toEqual(["A", "B", "D", "E"]);
  });

  it("does not mutate the input list", () => {
    const list = ["A"];
    toggleSelection(list, "B", 5);
    expect(list).toEqual(["A"]);
  });
});

describe("comparison thresholds", () => {
  it("requires at least two entities for a multi-series request", () => {
    expect(canCompare([], 2)).toBe(false);
    expect(canCompare(["Maize"], 2)).toBe(false);
    expect(canCompare(["Maize", "Beans"], 2)).toBe(true);
  });

  it("reports fullness at the ceiling", () => {
    expect(isSelectionFull(["A", "B", "C", "D"], 4)).toBe(true);
    expect(isSelectionFull(["A", "B", "C"], 4)).toBe(false);
  });
});

describe("filterByLabel", () => {
  const items = [
    { id: "1", label: "Maize" },
    { id: "2", label: "Irish potatoes" },
    { id: "3", label: "Ibirayi" },
  ];

  it("returns everything for an empty query", () => {
    expect(filterByLabel(items, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively as a substring", () => {
    expect(filterByLabel(items, "pot").map((i) => i.id)).toEqual(["2"]);
  });

  it("accepts a diacritic-folding normalizer", () => {
    const filtered = filterByLabel(items, "ibira", slugifyEntity);
    expect(filtered.map((i) => i.id)).toEqual(["3"]);
  });
});


// merged from comparison-alignment.test.ts
describe("alignToPeriodAxis", () => {
  it("places every series on one ordered axis with nulls where a period is absent", () => {
    const series: PeriodKeyedSeries[] = [
      { key: "Maize", label: "Maize", valuesByPeriod: { "2023A": 1, "2023B": 2, "2024A": 3 } },
      { key: "Rice", label: "Rice", valuesByPeriod: { "2023B": 20, "2024A": 30 } },
    ];
    const aligned = alignToPeriodAxis(series, ["2023A", "2023B", "2024A"]);
    expect(aligned[0].points.map((p) => p.value)).toEqual([1, 2, 3]);
    // Rice has no 2023A observation: that is a gap, not a zero.
    expect(aligned[1].points.map((p) => p.value)).toEqual([null, 20, 30]);
    expect(aligned[1].points.map((p) => p.label)).toEqual(["2023A", "2023B", "2024A"]);
  });

  it("orders the axis by period code, never by arrival order", () => {
    const series = [{ key: "a", label: "a", valuesByPeriod: { "2024A": 3, "2023A": 1 } }];
    const aligned = alignToPeriodAxis(series, ["2024A", "2023A"]);
    expect(aligned[0].points.map((p) => p.label)).toEqual(["2023A", "2024A"]);
  });
});

describe("alignIndexedSeries", () => {
  it("keeps each crop's own observation under its own period", () => {
    const response = [
      { crop: "Maize", points: [{ period: "2024A", index: 100 }, { period: "2024B", index: 110 }] },
      { crop: "Rice", points: [{ period: "2024B", index: 90 }] },
    ];
    const aligned = alignIndexedSeries(response, ["2024A", "2024B"]);
    const maize = aligned.find((s) => s.key === "Maize")!;
    const rice = aligned.find((s) => s.key === "Rice")!;
    expect(maize.points.map((p) => p.value)).toEqual([100, 110]);
    expect(rice.points.map((p) => p.value)).toEqual([null, 90]);
  });

  it("falls back to the union axis when the response axis misses a point", () => {
    const response = [
      { crop: "Maize", points: [{ period: "2024A", index: 100 }] },
      { crop: "Rice", points: [{ period: "2025B", index: 80 }] },
    ];
    // The server-supplied axis omits 2025B, which a series actually published.
    const aligned = alignIndexedSeries(response, ["2024A"]);
    const rice = aligned.find((s) => s.key === "Rice")!;
    expect(rice.points.map((p) => p.label)).toContain("2025B");
    expect(rice.points.map((p) => p.value)).toEqual([null, 80]);
  });
});

describe("axis helpers", () => {
  it("indexByPeriod keys values by period code", () => {
    expect(indexByPeriod([{ period: "2023A", value: 4 }])).toEqual({ "2023A": 4 });
  });

  it("unionPeriods returns a de-duplicated chronological axis", () => {
    expect(
      unionPeriods([{ period: "2024B" }, { period: "2023A" }, { period: "2024B" }]),
    ).toEqual(["2023A", "2024B"]);
  });
});


// merged from compare-selection-merge.test.ts
const LIMITS = { maxCrops: 5, maxDistricts: 4 };

function stored(overrides: Partial<CompareSelection> = {}): CompareSelection {
  return { ...EMPTY_COMPARE_SELECTION, ...overrides };
}

describe("parseParamList", () => {
  it("splits and cleans a comma list", () => {
    expect(parseParamList("Maize, Sorghum , Beans,")).toEqual(["Maize", "Sorghum", "Beans"]);
  });

  it("returns empty for missing values", () => {
    expect(parseParamList(undefined)).toEqual([]);
    expect(parseParamList("")).toEqual([]);
    expect(parseParamList(null)).toEqual([]);
  });
});

describe("mergeCompareSelection", () => {
  it("keeps the stored selection when a deep link carries no ids", () => {
    const result = mergeCompareSelection(
      stored({ crops: ["Maize", "Beans"], mode: "crops" }),
      {},
      LIMITS,
    );
    expect(result.crops).toEqual(["Maize", "Beans"]);
    expect(result.mode).toBe("crops");
  });

  it("puts the route ids first and keeps the stored ones behind them", () => {
    const result = mergeCompareSelection(
      stored({ crops: ["Beans", "Sorghum"] }),
      { crops: "Maize,Soybean" },
      LIMITS,
    );
    expect(result.crops).toEqual(["Maize", "Soybean", "Beans", "Sorghum"]);
  });

  it("merges a single crop param without discarding stored picks", () => {
    const result = mergeCompareSelection(stored({ crops: ["Beans"] }), { crop: "Maize" }, LIMITS);
    expect(result.crops).toEqual(["Maize", "Beans"]);
    expect(result.compareCrop).toBe("Maize");
  });

  it("deduplicates route ids that already exist in storage", () => {
    const result = mergeCompareSelection(
      stored({ crops: ["Maize", "Beans"] }),
      { crops: "Maize" },
      LIMITS,
    );
    expect(result.crops).toEqual(["Maize", "Beans"]);
  });

  it("respects the crop limit rather than evicting stored picks silently", () => {
    const result = mergeCompareSelection(
      stored({ crops: ["A", "B", "C", "D", "E"] }),
      { crop: "Z" },
      LIMITS,
    );
    expect(result.crops).toEqual(["Z", "A", "B", "C", "D"]);
  });

  it("merges district ids the same way", () => {
    const result = mergeCompareSelection(
      stored({ districts: ["KGL", "HUY"] }),
      { districts: "MHN", mode: "districts" },
      LIMITS,
    );
    expect(result.mode).toBe("districts");
    expect(result.districts).toEqual(["MHN", "KGL", "HUY"]);
  });

  it("honours an explicit mode of crops over stored districts mode", () => {
    const result = mergeCompareSelection(stored({ mode: "districts" }), { mode: "crops" }, LIMITS);
    expect(result.mode).toBe("crops");
  });

  it("keeps a stored compareCrop when the route does not name one", () => {
    const result = mergeCompareSelection(stored({ compareCrop: "Beans" }), {}, LIMITS);
    expect(result.compareCrop).toBe("Beans");
  });
});
