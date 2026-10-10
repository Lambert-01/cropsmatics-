import { describe, expect, it } from "vitest";

import {
  applyAxisWindow,
  periodWindowCount,
  selectPeriodWindow,
  type SeriesPoint,
} from "../src/utils/analytics";

/** Seasonal axis, exactly as the board publishes it (no calendar regularity). */
const SEASONS = ["2022B", "2023A", "2023B", "2024A", "2024B", "2025A", "2025B", "2026A"];

function points(values: (number | null)[]): SeriesPoint[] {
  return values.map((value, index) => ({ label: SEASONS[index], value }));
}

describe("period window", () => {
  it("reports the trailing count, or null for 'all'", () => {
    expect(periodWindowCount("all")).toBeNull();
    expect(periodWindowCount("last4")).toBe(4);
    expect(periodWindowCount("last8")).toBe(8);
  });

  it("keeps the latest N positions of the official axis, not N years", () => {
    const series = points([1, 2, 3, 4, 5, 6, 7, 8]);
    const last4 = selectPeriodWindow(series, "last4");
    expect(last4.map((p) => p.label)).toEqual(["2024B", "2025A", "2025B", "2026A"]);
  });

  it("returns every point for 'all' (as a copy)", () => {
    const series = points([1, 2, 3]);
    const all = selectPeriodWindow(series, "all");
    expect(all).toEqual(series);
    expect(all).not.toBe(series);
  });

  it("preserves null observations inside the window instead of dropping them", () => {
    const series: SeriesPoint[] = [
      { label: "2023A", value: 1 },
      { label: "2023B", value: 2 },
      { label: "2024A", value: null },
      { label: "2024B", value: 4 },
      { label: "2025A", value: null },
      { label: "2025B", value: 6 },
      { label: "2026A", value: 7 },
    ];
    const last4 = selectPeriodWindow(series, "last4");
    // The 2025A null stays a gap at its own position, not skipped over.
    expect(last4).toEqual([
      { label: "2024B", value: 4 },
      { label: "2025A", value: null },
      { label: "2025B", value: 6 },
      { label: "2026A", value: 7 },
    ]);
  });

  it("does not window a series shorter than the requested count", () => {
    const series = points([1, 2]);
    expect(selectPeriodWindow(series, "last8")).toEqual(series);
  });
});

describe("shared axis window for aligned series", () => {
  it("slices every series to the same trailing positions", () => {
    const a = { key: "a", label: "Maize", points: points([1, 2, 3, 4, 5, 6]) };
    const b = { key: "b", label: "Rice", points: points([9, 8, 7, 6, 5, 4]) };
    const [wa, wb] = applyAxisWindow([a, b], "last4");

    expect(wa.points.map((p) => p.label)).toEqual(["2023B", "2024A", "2024B", "2025A"]);
    // Position i describes the same period in both series after windowing.
    expect(wb.points.map((p) => p.label)).toEqual(wa.points.map((p) => p.label));
  });

  it("keeps nulls aligned so a crop missing a period stays missing there", () => {
    const a = { key: "a", label: "Maize", points: points([1, 2, 3, 4, 5, 6]) };
    const b = { key: "b", label: "Rice", points: points([null, null, 7, null, 5, 4]) };
    const [wa, wb] = applyAxisWindow([a, b], "last4");
    expect(wb.points.map((p) => p.value)).toEqual([7, null, 5, 4]);
    expect(wa.points.map((p) => p.value)).toEqual([3, 4, 5, 6]);
  });
});
