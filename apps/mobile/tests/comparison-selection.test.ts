import { describe, expect, it } from "vitest";

import {
  canCompare,
  filterByLabel,
  isSelectionFull,
  toggleSelection,
} from "../src/utils/selection";
import { slugifyEntity } from "../src/utils/slug";

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
