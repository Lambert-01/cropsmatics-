import { describe, expect, it } from "vitest";

import {
  EMPTY_COMPARE_SELECTION,
  mergeCompareSelection,
  parseParamList,
} from "../src/utils/selection";
import type { CompareSelection } from "../src/utils/selection";

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
