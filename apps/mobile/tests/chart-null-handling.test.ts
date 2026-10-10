import { describe, expect, it } from "vitest";

import {
  latestObservation,
  publishedCount,
  selectPeriodWindow,
  seriesSegments,
  toSeriesPoints,
  type RawPoint,
  type SeriesPoint,
} from "../src/utils/analytics";

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
