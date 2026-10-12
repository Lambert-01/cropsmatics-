import { describe, expect, it } from "vitest";
import { GESTURE_SLOP, isScrubIntent, isTapMovement } from "../src/utils/chartGesture";
import { latestObservation, publishedCount, selectPeriodWindow, seriesSegments, toSeriesPoints, type RawPoint, type SeriesPoint, applyAxisWindow, periodWindowCount } from "../src/utils/analytics";
import { divergingBar, hasNegative, maxMagnitude, MIN_BAR_PCT } from "../src/utils/diverging";
import type { NationalBoardCrop, SameSeasonChange } from "../src/types";
import { computeMovers } from "../src/utils/movers";

// merged from chart-gesture.test.ts
const start = { x: 100, y: 200 };

describe("isScrubIntent", () => {
  it("claims a clearly horizontal drag", () => {
    expect(isScrubIntent(start, { x: 100 + GESTURE_SLOP + 4, y: 203 })).toBe(true);
  });

  it("leaves a vertical drag to the scroll view", () => {
    expect(isScrubIntent(start, { x: 104, y: 200 + GESTURE_SLOP * 4 })).toBe(false);
  });

  it("ignores sub-slop jitter", () => {
    expect(isScrubIntent(start, { x: start.x + GESTURE_SLOP - 1, y: start.y })).toBe(false);
  });

  it("ignores a sideways drift that is mostly vertical", () => {
    expect(isScrubIntent(start, { x: start.x + 12, y: start.y + 40 })).toBe(false);
  });

  it("never claims without a recorded touch start", () => {
    expect(isScrubIntent(null, { x: 300, y: 200 })).toBe(false);
  });
});

describe("isTapMovement", () => {
  it("accepts a press that barely moved", () => {
    expect(isTapMovement(start, { x: start.x + 3, y: start.y + 4 })).toBe(true);
  });

  it("rejects anything past the slop radius", () => {
    expect(isTapMovement(start, { x: start.x + GESTURE_SLOP + 1, y: start.y })).toBe(false);
    expect(isTapMovement(start, { x: start.x, y: start.y + GESTURE_SLOP + 1 })).toBe(false);
  });

  it("rejects a scrub that ended far from where it began", () => {
    expect(isTapMovement(start, { x: start.x + 120, y: start.y + 2 })).toBe(false);
  });

  it("rejects without a recorded touch start", () => {
    expect(isTapMovement(null, start)).toBe(false);
  });
});


// merged from chart-null-handling.test.ts
/**
 * These tests pin the one rule the chart engine exists to protect: a period the
 * API did not publish for a metric is a *gap*, never a zero.
 */

const RAW: RawPoint[] = [
  { period: "2023A", label: "2023A", values: { yield_mt_ha: 1.2 } },
  { period: "2023B", label: "2023B", values: { yield_mt_ha: null } },
  { period: "2024A", label: "2024A", values: {} },
  { period: "2024B", label: "2024B", values: { yield_mt_ha: 1.5 } },
  { period: "2025A", label: "2025A", values: { yield_mt_ha: 1.6 } },
];

describe("toSeriesPoints", () => {
  it("keeps a missing observation as null rather than 0", () => {
    const series = toSeriesPoints(RAW, "yield_mt_ha");
    expect(series.map((p) => p.value)).toEqual([1.2, null, null, 1.5, 1.6]);
  });

  it("counts only real values as published", () => {
    expect(publishedCount(toSeriesPoints(RAW, "yield_mt_ha"))).toBe(3);
  });
});

describe("seriesSegments", () => {
  it("breaks the line at a gap instead of drawing across it", () => {
    const series: SeriesPoint[] = [
      { label: "2023A", value: 1 },
      { label: "2023B", value: null },
      { label: "2024A", value: 3 },
    ];
    const segments = seriesSegments(series);
    expect(segments).toHaveLength(2);
    expect(segments[0].points).toEqual([{ label: "2023A", value: 1 }]);
    expect(segments[1].points).toEqual([{ label: "2024A", value: 3 }]);
  });

  it("treats a lone published point as its own one-point segment", () => {
    const series: SeriesPoint[] = [
      { label: "2023A", value: null },
      { label: "2023B", value: 9 },
      { label: "2024A", value: null },
    ];
    const segments = seriesSegments(series);
    expect(segments).toHaveLength(1);
    expect(segments[0].points).toHaveLength(1);
    expect(segments[0].start).toBe(1);
  });
});

describe("latestObservation", () => {
  it("skips trailing nulls and reports the newest real value", () => {
    const withTrailingGap = [
      ...RAW,
      { period: "2025B", label: "2025B", values: { yield_mt_ha: null } },
    ];
    const latest = latestObservation(withTrailingGap, "yield_mt_ha");
    expect(latest?.period).toBe("2025A");
    expect(latest?.value).toBe(1.6);
  });

  it("returns null (not zero) when nothing is published", () => {
    expect(latestObservation(RAW, "production_mt")).toBeNull();
  });
});

describe("nulls survive the period window", () => {
  it("keeps a null inside the trailing window", () => {
    const series = toSeriesPoints(RAW, "yield_mt_ha");
    const windowed = selectPeriodWindow(series, "last4");
    expect(windowed.map((p) => p.value)).toEqual([null, null, 1.5, 1.6]);
  });
});


// merged from chart-period-window.test.ts
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


// merged from diverging.test.ts
describe("maxMagnitude / hasNegative", () => {
  it("ignores nulls and non-finite values", () => {
    expect(maxMagnitude([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -12, 4])).toBe(12);
    expect(hasNegative([null, 1, 2])).toBe(false);
    expect(hasNegative([1, -0.0001])).toBe(true);
  });

  it("returns 0 for an empty or entirely unpublished set", () => {
    expect(maxMagnitude([])).toBe(0);
    expect(maxMagnitude([null, undefined])).toBe(0);
  });
});

describe("divergingBar", () => {
  it("leaves an unpublished value with no fill", () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(divergingBar(value, 50)).toEqual({ side: "none", widthPct: 0, negative: false });
    }
  });

  it("sends negative values left of the baseline and positives right", () => {
    expect(divergingBar(-50, 50)).toMatchObject({ side: "left", negative: true, widthPct: 100 });
    expect(divergingBar(-10, 50).side).toBe("left");
    expect(divergingBar(-1, 50).side).toBe("left");
    expect(divergingBar(1, 50).side).toBe("right");
    expect(divergingBar(10, 50).side).toBe("right");
    expect(divergingBar(50, 50)).toMatchObject({ side: "right", widthPct: 100 });
  });

  it("keeps a published zero visible instead of collapsing it to nothing", () => {
    const zero = divergingBar(0, 50);
    expect(zero.side).toBe("right");
    expect(zero.widthPct).toBe(MIN_BAR_PCT);
  });

  it("scales relative to the largest magnitude in the set", () => {
    const max = maxMagnitude([-50, -10, -1, 0, 1, 10, 50]);
    expect(max).toBe(50);
    expect(divergingBar(-50, max).widthPct).toBe(100);
    expect(divergingBar(-10, max).widthPct).toBeCloseTo(20, 5);
    expect(divergingBar(1, max).widthPct).toBeCloseTo(2, 5); // exactly the floor
    expect(divergingBar(50, max).widthPct).toBe(100);
  });

  it("never produces a width below the floor, above 100, or a NaN/Infinity", () => {
    const max = maxMagnitude([-50, -10, -1, 0, 1, 10, 50]);
    for (const value of [-50, -10, -1, 0, 1, 10, 50]) {
      const bar = divergingBar(value, max);
      expect(Number.isFinite(bar.widthPct)).toBe(true);
      expect(bar.widthPct).toBeGreaterThanOrEqual(MIN_BAR_PCT);
      expect(bar.widthPct).toBeLessThanOrEqual(100);
    }
  });

  it("degrades safely when the whole set is zero", () => {
    const max = maxMagnitude([0, 0, 0]);
    expect(max).toBe(0);
    expect(divergingBar(0, max)).toMatchObject({ side: "right", widthPct: MIN_BAR_PCT });
    expect(divergingBar(-0, max).negative).toBe(false);
  });

  it("treats a negative zero as a non-negative value", () => {
    expect(divergingBar(-0, 10).side).toBe("right");
  });
});


// merged from movers.test.ts
const METRIC = "production_mt";

/** A board crop whose same-season change is either published or explicitly absent. */
function crop(name: string, changePct: number | null): NationalBoardCrop {
  const change: SameSeasonChange = {
    metric: METRIC,
    unit: "t",
    available: changePct !== null,
    reason: changePct === null ? "previous year not published" : null,
    period_code: "2025B",
    period_label: "2025 Season B",
    previous_period_code: "2024B",
    previous_period_label: "2024 Season B",
    current_value: changePct === null ? null : 100,
    previous_value: changePct === null ? null : 100,
    change_pct: changePct,
    change_abs: changePct,
  };
  return {
    crop: name,
    coverage: "national",
    n_published_periods: 2,
    latest_published_period: "2025B",
    latest_published_label: "2025 Season B",
    series: {},
    changes: { [METRIC]: change },
  };
}

describe("computeMovers", () => {
  it("ranks the strongest rise first and the largest fall first", () => {
    const board = [crop("Maize", 12), crop("Beans", -8), crop("Rice", 3), crop("Potato", -15)];
    const { growing, falling } = computeMovers(board, METRIC, 2);
    expect(growing.map((m) => m.crop)).toEqual(["Maize", "Rice"]);
    expect(falling.map((m) => m.crop)).toEqual(["Potato", "Beans"]);
  });

  it("never turns a missing comparison into a zero-percent move", () => {
    const board = [crop("Maize", 5), crop("Cassava", null)];
    const { growing, falling } = computeMovers(board, METRIC, 3);
    expect(growing.map((m) => m.crop)).toEqual(["Maize"]);
    expect(falling.map((m) => m.crop)).toEqual(["Maize"]);
    expect([...growing, ...falling].some((m) => m.crop === "Cassava")).toBe(false);
  });

  it("respects the limit and returns empty lists for an empty board", () => {
    const board = [crop("A", 1), crop("B", 2), crop("C", 3), crop("D", 4)];
    expect(computeMovers(board, METRIC, 3).growing).toHaveLength(3);
    expect(computeMovers(undefined, METRIC)).toEqual({ growing: [], falling: [] });
  });
});
