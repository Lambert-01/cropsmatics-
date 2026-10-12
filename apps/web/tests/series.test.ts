import { describe, expect, it } from "vitest";

import {
  availableSeriesKeys,
  defaultSeriesKeys,
  seriesLabelText,
  toggleSeriesKey,
  type SeriesSpec,
} from "@/lib/series";

const SPECS: SeriesSpec[] = [
  { key: "improved_seed_pct", label: "Improved seed", color: "#000" },
  { key: "inorganic_fertilizer_pct", label: "Inorganic fertilizer", color: "#111" },
  { key: "organic_fertilizer_pct", label: "Organic fertilizer", color: "#222" },
  { key: "pesticide_pct", label: "Pesticide", color: "#333" },
  { key: "irrigation_pct", label: "Irrigation", color: "#444" },
  { key: "anti_erosion_pct", label: "Anti-erosion", color: "#555" },
];

describe("availableSeriesKeys", () => {
  it("offers only series that carry a published value", () => {
    const points = [
      { improved_seed_pct: 12, pesticide_pct: 3 },
      { improved_seed_pct: 15, pesticide_pct: null },
    ];
    expect(availableSeriesKeys(SPECS, points)).toEqual(["improved_seed_pct", "pesticide_pct"]);
  });

  it("treats a published zero as a value and a missing one as absent", () => {
    // The pipeline distinguishes "NISR published 0%" from "not published". A
    // series that only ever holds an explicit zero is still selectable.
    const points = [{ irrigation_pct: 0, anti_erosion_pct: null }];
    expect(availableSeriesKeys(SPECS, points)).toEqual(["irrigation_pct"]);
  });

  it("offers nothing when there are no points", () => {
    expect(availableSeriesKeys(SPECS, [])).toEqual([]);
  });
});

describe("defaultSeriesKeys", () => {
  it("defaults to a readable subset rather than every indicator", () => {
    const points = [
      {
        improved_seed_pct: 1,
        inorganic_fertilizer_pct: 2,
        organic_fertilizer_pct: 3,
        pesticide_pct: 4,
        irrigation_pct: 5,
        anti_erosion_pct: 6,
      },
    ];
    const visible = defaultSeriesKeys(SPECS, points);
    // Six lines on one axis is a wall, not an insight: the default is three and
    // the rest stay one click away.
    expect(visible).toEqual([
      "improved_seed_pct",
      "inorganic_fertilizer_pct",
      "organic_fertilizer_pct",
    ]);
    expect(visible.length).toBeLessThan(SPECS.length);
  });

  it("never returns more than the limit", () => {
    const points = [
      {
        improved_seed_pct: 1,
        inorganic_fertilizer_pct: 2,
        organic_fertilizer_pct: 3,
        pesticide_pct: 4,
      },
    ];
    expect(defaultSeriesKeys(SPECS, points)).toHaveLength(3);
    expect(defaultSeriesKeys(SPECS, points, 2)).toHaveLength(2);
  });

  it("skips an indicator the source does not publish", () => {
    const points = [{ improved_seed_pct: 1, irrigation_pct: 20 }];
    expect(defaultSeriesKeys(SPECS, points)).toEqual(["improved_seed_pct", "irrigation_pct"]);
  });
});

describe("toggleSeriesKey", () => {
  it("adds and removes a series", () => {
    expect(toggleSeriesKey(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSeriesKey(["a", "b"], "a")).toEqual(["b"]);
  });

  it("refuses to leave the chart empty", () => {
    // An empty chart looks identical to "no data published", so removing the
    // last visible series is not a state the reader can have asked for.
    expect(toggleSeriesKey(["a"], "a")).toEqual(["a"]);
  });
});

describe("seriesLabelText", () => {
  it("names the visible series for the chart subtitle", () => {
    expect(seriesLabelText(["improved_seed_pct", "pesticide_pct"], SPECS)).toBe(
      "Improved seed, Pesticide",
    );
  });
});
