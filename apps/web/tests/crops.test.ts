import { describe, expect, it } from "vitest";

import {
  cropAvailability,
  cropSummaries,
  groupCropsByCategory,
  loadSavedCrops,
  resolveCrop,
  SAVED_CROPS_KEY,
  saveSavedCrops,
  toggleSavedCrop,
  UNCATEGORISED,
} from "@/features/crops/catalog";
import type { Crop, NationalBoardCrop } from "@/types";

const CROPS: Crop[] = [
  { crop_code: "MAIZE", crop_name: "Maize", category: "Cereals" },
  { crop_code: "RICE", crop_name: "Rice", category: "Cereals" },
  { crop_code: "BEAN", crop_name: "Beans", category: "Pulses" },
  { crop_code: "POTATO", crop_name: "Potato" },
];

describe("resolveCrop", () => {
  it("matches by crop code, case-insensitively", () => {
    expect(resolveCrop(CROPS, "maize")?.crop_name).toBe("Maize");
    expect(resolveCrop(CROPS, "MAIZE")?.crop_name).toBe("Maize");
  });

  it("matches by display name, so a shared link can use either", () => {
    expect(resolveCrop(CROPS, "Beans")?.crop_code).toBe("BEAN");
    expect(resolveCrop(CROPS, "  rice ")?.crop_code).toBe("RICE");
  });

  it("returns undefined for a blank, unknown, or missing-catalogue slug", () => {
    expect(resolveCrop(CROPS, "")).toBeUndefined();
    expect(resolveCrop(CROPS, "   ")).toBeUndefined();
    expect(resolveCrop(CROPS, "cassava")).toBeUndefined();
    expect(resolveCrop(undefined, "maize")).toBeUndefined();
  });

  it("never matches a crop whose code is absent", () => {
    const noCode: Crop[] = [{ crop_code: "", crop_name: "Mystery" }];
    expect(resolveCrop(noCode, "")).toBeUndefined();
  });
});

describe("groupCropsByCategory", () => {
  it("groups by category, sorts groups and items, and buckets the rest", () => {
    const groups = groupCropsByCategory(CROPS);
    expect(groups.map((g) => g.category)).toEqual(["Cereals", "Other crops", "Pulses"]);
    expect(groups[0].items.map((c) => c.crop_name)).toEqual(["Maize", "Rice"]);
    expect(groups[1].items.map((c) => c.crop_name)).toEqual(["Potato"]);
    expect(groups[1].category).toBe(UNCATEGORISED);
  });

  it("returns an empty list for an empty or absent catalogue", () => {
    expect(groupCropsByCategory([])).toEqual([]);
    expect(groupCropsByCategory(undefined)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* National board summaries                                            */
/* ------------------------------------------------------------------ */

const BOARD_CROP: NationalBoardCrop = {
  crop: "Maize",
  coverage: "national",
  n_published_periods: 12,
  latest_published_period: "2026B",
  latest_published_label: "2026 Season B",
  series: {
    production_mt: [100, null, 120],
    harvested_area_ha: [50, null, 55],
    yield_mt_ha: [2.0, null, 2.2],
  },
  changes: {
    production_mt: {
      metric: "production_mt",
      unit: "metric tonnes",
      available: true,
      reason: null,
      period_code: "2026B",
      period_label: "2026 Season B",
      previous_period_code: "2025B",
      current_value: 120,
      previous_value: 110,
      change_pct: 9.0909,
      change_abs: 10,
    },
    harvested_area_ha: {
      metric: "harvested_area_ha",
      unit: "ha",
      // A value exists but no same-season comparison can be made: the card
      // must still show the value and must not show a fabricated delta.
      available: false,
      reason: "the same season one year earlier is not published for this crop",
      period_code: "2026B",
      period_label: "2026 Season B",
      current_value: 55,
      previous_value: null,
      change_pct: null,
      change_abs: null,
    },
    yield_mt_ha: {
      metric: "yield_mt_ha",
      unit: "t/ha",
      available: false,
      reason: "no published value for this metric",
      period_code: null,
      period_label: null,
      current_value: null,
      previous_value: null,
      change_pct: null,
      change_abs: null,
    },
  },
};

const UNITS = {
  production_mt: "metric tonnes",
  harvested_area_ha: "ha",
  yield_mt_ha: "t/ha",
};

describe("cropSummaries", () => {
  it("projects the display metrics in order, with the server's own values", () => {
    const summaries = cropSummaries(BOARD_CROP, UNITS);
    expect(summaries.map((m) => m.metric)).toEqual([
      "production_mt",
      "harvested_area_ha",
      "yield_mt_ha",
    ]);
    const production = summaries[0];
    expect(production.value).toBe(120);
    expect(production.unit).toBe("metric tonnes");
    expect(production.periodCode).toBe("2026B");
    expect(production.periodLabel).toBe("2026 Season B");
    expect(production.changeAvailable).toBe(true);
    expect(production.changePct).toBeCloseTo(9.0909);
  });

  it("keeps a published value without a comparison instead of inventing a delta", () => {
    const [, area] = cropSummaries(BOARD_CROP, UNITS);
    expect(area.value).toBe(55);
    expect(area.changeAvailable).toBe(false);
    expect(area.changePct).toBeNull();
    expect(area.changeReason).toContain("not published");
  });

  it("reports an untabulated metric as null, never as zero", () => {
    const [, , yieldMetric] = cropSummaries(BOARD_CROP, UNITS);
    expect(yieldMetric.value).toBeNull();
    expect(yieldMetric.changeAvailable).toBe(false);
    expect(yieldMetric.changeReason).toBe("no published value for this metric");
  });

  it("falls back to the server unit and tolerates a missing crop", () => {
    const summaries = cropSummaries(BOARD_CROP, {});
    expect(summaries[0].unit).toBe("metric tonnes");
    expect(cropSummaries(undefined, UNITS)).toEqual([]);
  });
});

describe("cropAvailability", () => {
  it("reports a coverage fraction over the full published axis", () => {
    expect(cropAvailability(BOARD_CROP, 14)).toEqual({
      published: true,
      text: "12 of 14 periods",
    });
  });

  it("names the release when the scope is a single period", () => {
    expect(cropAvailability(BOARD_CROP, 1)).toEqual({
      published: true,
      text: "Published in 2026 Season B",
    });
  });

  it("says plainly when the scoped release has nothing for this crop", () => {
    const unpublished: NationalBoardCrop = {
      ...BOARD_CROP,
      n_published_periods: 0,
      latest_published_period: null,
      latest_published_label: null,
    };
    expect(cropAvailability(unpublished, 1)).toEqual({
      published: false,
      text: "Not published for this period",
    });
    expect(cropAvailability(unpublished, 14).published).toBe(false);
  });

  it("never claims coverage the board did not report", () => {
    expect(cropAvailability(undefined, 14)).toEqual({
      published: false,
      text: "coverage not reported",
    });
  });
});

/* ------------------------------------------------------------------ */
/* Saved crops                                                         */
/* ------------------------------------------------------------------ */

function memoryStorage(initial?: string) {
  const store: Record<string, string> = {};
  if (initial !== undefined) store[SAVED_CROPS_KEY] = initial;
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    store,
  };
}

describe("saved crops", () => {
  it("round-trips a saved list", () => {
    const storage = memoryStorage();
    saveSavedCrops(storage, ["MAIZE", "BEAN"]);
    expect(loadSavedCrops(storage)).toEqual(["MAIZE", "BEAN"]);
  });

  it("tolerates corrupt, non-array and mixed-type entries", () => {
    expect(loadSavedCrops(memoryStorage("{not json"))).toEqual([]);
    expect(loadSavedCrops(memoryStorage('{"not":"an array"}'))).toEqual([]);
    expect(loadSavedCrops(memoryStorage('["MAIZE", 7, null, "", "  ", "BEAN"]'))).toEqual([
      "MAIZE",
      "BEAN",
    ]);
    expect(loadSavedCrops(null)).toEqual([]);
    expect(loadSavedCrops(undefined)).toEqual([]);
  });

  it("adds once, removes on the second toggle", () => {
    expect(toggleSavedCrop([], "MAIZE")).toEqual(["MAIZE"]);
    expect(toggleSavedCrop(["MAIZE"], "MAIZE")).toEqual([]);
    expect(toggleSavedCrop(["MAIZE"], "BEAN")).toEqual(["MAIZE", "BEAN"]);
  });

  it("never lets a blank code enter the saved list", () => {
    expect(toggleSavedCrop(["MAIZE"], "   ")).toEqual(["MAIZE"]);
    expect(toggleSavedCrop([], "")).toEqual([]);
  });
});
