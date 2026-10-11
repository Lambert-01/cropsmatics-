import { describe, expect, it } from "vitest";

import { groupCropsByCategory, resolveCrop, UNCATEGORISED } from "@/features/crops/catalog";
import type { Crop } from "@/types";

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
