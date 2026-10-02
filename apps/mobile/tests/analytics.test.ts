import { describe, expect, it } from "vitest";

import {
  filterSeason,
  formatMetric,
  formatPercent,
  formatValue,
  fromPeriodCoded,
  indexedSeries,
  isConstant,
  latestObservation,
  latestSeason,
  localBaseline,
  nearestIndex,
  niceTicks,
  percentChange,
  periodRank,
  pointLabel,
  publishedCount,
  sameSeasonChange,
  sameSeasonPrevious,
  seasonOf,
  seriesSegments,
  sortPoints,
  thinLabels,
  toSeriesPoints,
  valueLookup,
  yDomain,
  type RawPoint,
} from "../src/utils/analytics";

/** A crop tabulated in 2024B, 2025A and 2025B but NOT in 2026A. */
const GAPPED: RawPoint[] = [
  { period: "2024B", values: { production_mt: 100, yield_mt_ha: 1.2 } },
  { period: "2025A", values: { production_mt: null, yield_mt_ha: 1.4 } },
  { period: "2025B", values: { production_mt: 140, yield_mt_ha: 1.6 } },
  { period: "2026A", values: { production_mt: 180, yield_mt_ha: 1.8 } },
];

describe("period codes", () => {
  it("reads the season letter and rejects anything that is not a YYYYS period", () => {
    expect(seasonOf("2026B")).toBe("B");
    expect(seasonOf("2025a")).toBe("A");
    expect(seasonOf("2025-B")).toBeNull();
    expect(seasonOf("")).toBeNull();
  });

  it("orders periods chronologically within and across years", () => {
    const codes = ["2024C", "2026A", "2024A", "2025B", "2025A", "2024B", "2026B", "2025C"];
    expect([...codes].sort((a, b) => periodRank(a) - periodRank(b))).toEqual([
      "2024A",
      "2024B",
      "2024C",
      "2025A",
      "2025B",
      "2025C",
      "2026A",
      "2026B",
    ]);
  });

  it("pairs each period with the same season one year earlier", () => {
    expect(sameSeasonPrevious("2026B")).toBe("2025B");
    expect(sameSeasonPrevious("2024A")).toBe("2023A");
    expect(sameSeasonPrevious("2025-B")).toBeNull();
  });

  it("sorts points without mutating the input", () => {
    const input: RawPoint[] = [
      { period: "2026A", values: {} },
      { period: "2024B", values: {} },
    ];
    const sorted = sortPoints(input);
    expect(sorted.map((point) => point.period)).toEqual(["2024B", "2026A"]);
    expect(input[0].period).toBe("2026A");
  });
});

describe("series construction keeps missing periods visible", () => {
  it("returns one point per published period, with null where nothing was published", () => {
    const points = toSeriesPoints(GAPPED, "production_mt");
    expect(points).toEqual([
      { label: "2024B", value: 100 },
      { label: "2025A", value: null },
      { label: "2025B", value: 140 },
      { label: "2026A", value: 180 },
    ]);
  });

  it("never treats a missing value as zero", () => {
    const points = toSeriesPoints(GAPPED, "production_mt");
    expect(points[1].value).toBeNull();
    expect(points[1].value).not.toBe(0);
  });

  it("splits the line at a missing period instead of drawing through it", () => {
    const segments = seriesSegments(toSeriesPoints(GAPPED, "production_mt"));
    expect(segments).toHaveLength(2);
    expect(segments[0].points.map((point) => point.label)).toEqual(["2024B"]);
    expect(segments[1].points.map((point) => point.label)).toEqual(["2025B", "2026A"]);
    // The indices are the real ones, so the x axis stays aligned.
    expect(segments[1].start).toBe(2);
    expect(segments[1].end).toBe(3);
  });

  it("produces no segments at all when nothing was published", () => {
    const points = toSeriesPoints([{ period: "2026A", values: { production_mt: null } }], "production_mt");
    expect(seriesSegments(points)).toEqual([]);
    expect(publishedCount(points)).toBe(0);
  });

  it("keeps a lone published point as its own segment so it can be drawn as a dot", () => {
    const segments = seriesSegments([
      { label: "2026A", value: null },
      { label: "2026B", value: 42 },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].points).toHaveLength(1);
    expect(segments[0].start).toBe(1);
  });

  it("uses the API label when one is supplied", () => {
    expect(pointLabel({ period: "2025B", label: "2025 Season B", values: {} })).toBe("2025 Season B");
  });
});

describe("metric switching", () => {
  it("reads the requested metric only", () => {
    expect(toSeriesPoints(GAPPED, "yield_mt_ha").map((point) => point.value)).toEqual([1.2, 1.4, 1.6, 1.8]);
    expect(toSeriesPoints(GAPPED, "harvested_area_ha").map((point) => point.value)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("reports the latest period that actually published the metric", () => {
    expect(latestObservation(GAPPED, "production_mt")).toEqual({
      period: "2026A",
      label: "2026A",
      value: 180,
    });
    expect(latestObservation(GAPPED, "harvested_area_ha")).toBeNull();
  });

  it("detects a constant series so the axis can be padded instead of collapsed", () => {
    expect(isConstant([{ label: "a", value: 5 }, { label: "b", value: 5 }])).toBe(true);
    expect(isConstant([{ label: "a", value: 5 }, { label: "b", value: 6 }])).toBe(false);
    // A single published point is not a constant series.
    expect(isConstant([{ label: "a", value: 5 }])).toBe(false);
  });
});

describe("change eligibility", () => {
  it("reports no change at all when the same season last year was not published", () => {
    // 2026A is the latest published period and 2025A exists as a period, but its
    // value is blank. A change against a missing observation is not a number.
    expect(sameSeasonChange(GAPPED, "production_mt")).toBeNull();
  });

  it("names both observations it compared", () => {
    const points: RawPoint[] = [
      { period: "2025A", label: "2025 Season A", values: { production_mt: 100 } },
      { period: "2026A", label: "2026 Season A", values: { production_mt: 130 } },
    ];
    const change = sameSeasonChange(points, "production_mt");
    expect(change?.current.period).toBe("2026A");
    expect(change?.previous.period).toBe("2025A");
    expect(change?.previous.label).toBe("2025 Season A");
    expect(change?.changePct).toBeCloseTo(30, 6);
  });

  it("does nothing when the previous year is absent from the series entirely", () => {
    const points: RawPoint[] = [{ period: "2026A", values: { production_mt: 130 } }];
    expect(sameSeasonChange(points, "production_mt")).toBeNull();
  });

  it("reports a change only when both observations exist", () => {
    const points: RawPoint[] = [
      { period: "2025A", values: { yield_mt_ha: 2.0 } },
      { period: "2026A", values: { yield_mt_ha: 2.5 } },
    ];
    const change = sameSeasonChange(points, "yield_mt_ha");
    expect(change?.changePct).toBeCloseTo(25, 6);
    expect(change?.changeAbs).toBeCloseTo(0.5, 6);
  });

  it("does not compare across different seasons", () => {
    const points: RawPoint[] = [
      { period: "2025B", values: { yield_mt_ha: 1.0 } },
      { period: "2026A", values: { yield_mt_ha: 2.0 } },
    ];
    expect(sameSeasonChange(points, "yield_mt_ha")).toBeNull();
  });

  it("returns null rather than an unbounded percentage for a zero baseline", () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
    expect(percentChange(null, 5)).toBeNull();
    expect(percentChange(0, 5)).toBeCloseTo(-100, 6);
  });

  it("uses the magnitude of a negative baseline so the sign still means direction", () => {
    // -10 -> -5 is a rise, and dividing by |baseline| keeps it a rise.
    expect(percentChange(-5, -10)).toBeCloseTo(50, 6);
    expect(percentChange(-20, -10)).toBeCloseTo(-100, 6);
  });

  it("selects the same-season view from the latest published season", () => {
    expect(latestSeason(GAPPED)).toBe("A");
    expect(filterSeason(GAPPED, "B").map((point) => point.period)).toEqual(["2024B", "2025B"]);
    expect(filterSeason(GAPPED, null)).toHaveLength(GAPPED.length);
  });
});

describe("axis and label layout", () => {
  it("centres a constant series in the plot instead of collapsing it", () => {
    const domain = yDomain([{ label: "a", value: 7 }, { label: "b", value: 7 }]);
    expect(domain.min).toBeLessThan(7);
    expect(domain.max).toBeGreaterThan(7);
    expect((domain.min + domain.max) / 2).toBeCloseTo(7, 6);
  });

  it("keeps negative values in the domain", () => {
    const domain = yDomain([{ label: "a", value: -4 }]);
    expect(domain.min).toBeLessThanOrEqual(-4);
    expect(domain.max).toBeGreaterThan(-4);
  });

  it("produces ascending, readable ticks with no floating-point noise", () => {
    const ticks = niceTicks(0, 10, 4);
    expect(ticks.length).toBeGreaterThan(1);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    for (const tick of ticks) {
      expect(Number.isFinite(tick)).toBe(true);
      expect(String(tick)).not.toMatch(/\d{6,}/);
    }
  });

  it("thins x labels while always keeping the last published period", () => {
    const labels = ["2024A", "2024B", "2024C", "2025A", "2025B", "2025C", "2026A", "2026B"];
    const thinned = thinLabels(labels, 4);
    expect(thinned).toHaveLength(labels.length);
    expect(thinned[thinned.length - 1]).toBe("2026B");
    expect(thinned.filter(Boolean).length).toBeLessThanOrEqual(5);
  });

  it("shows every label when they already fit", () => {
    expect(thinLabels(["2026A", "2026B"], 4)).toEqual(["2026A", "2026B"]);
  });

  it("snaps a touch offset to the nearest published point and clamps at the edges", () => {
    expect(nearestIndex(0, 40, 240, 8)).toBe(0);
    expect(nearestIndex(10000, 40, 240, 8)).toBe(7);
    expect(nearestIndex(-100, 40, 240, 8)).toBe(0);
    expect(nearestIndex(160, 40, 240, 8)).toBe(4);
    // A single point has nothing to interpolate between.
    expect(nearestIndex(123, 40, 240, 1)).toBe(0);
  });
});

describe("indexed yield baseline rules", () => {
  it("indexes each crop to its own baseline", () => {
    const points = indexedSeries(
      [
        { period: "2025A", values: { yield_mt_ha: 1.0 } },
        { period: "2026A", values: { yield_mt_ha: 1.5 } },
      ],
      "yield_mt_ha",
      1.25,
    );
    expect(points.map((point) => point.value)).toEqual([80, 120]);
  });

  it("produces no index when there is no usable baseline", () => {
    expect(indexedSeries(GAPPED, "yield_mt_ha", null)).toEqual([]);
    expect(indexedSeries(GAPPED, "yield_mt_ha", 0)).toEqual([]);
    expect(indexedSeries(GAPPED, "yield_mt_ha", -3)).toEqual([]);
  });

  it("keeps missing observations missing through the index", () => {
    const points = indexedSeries(GAPPED, "production_mt", 100);
    expect(points[1].value).toBeNull();
  });

  it("computes a per-crop baseline from that crop's own published values only", () => {
    expect(localBaseline([1, 2, 3])).toBe(2);
    expect(localBaseline([1, 2, 3, 4])).toBe(2.5);
    expect(localBaseline([null, 0, 5, 10])).toBe(7.5);
    expect(localBaseline([])).toBeNull();
    expect(localBaseline([null, 0])).toBeNull();
  });
});

describe("value rendering", () => {
  it("renders an unpublished value as an em dash, never as zero", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatMetric(null, "kg/ha")).toBe("—");
    expect(formatMetric(0, "ha")).toBe("0 ha");
  });

  it("keeps the unit next to the number", () => {
    expect(formatMetric(1234.5, "kg/ha", 0)).toBe("1,235 kg/ha");
    expect(formatMetric(2.5, "t/ha")).toBe("2.5 t/ha");
  });

  it("formats a percentage with an explicit sign and a real minus glyph", () => {
    expect(formatPercent(12.34)).toBe("+12.3%");
    expect(formatPercent(-4)).toBe("−4.0%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("table lookups", () => {
  it("maps an entity id to its published value and keeps blanks as null", () => {
    const rows: { district_code: string | null; yield_kg_ha: number | null }[] = [
      { district_code: "RW-01", yield_kg_ha: 1200 },
      { district_code: "RW-02", yield_kg_ha: null },
      { district_code: null, yield_kg_ha: 999 },
    ];
    const lookup = valueLookup(
      rows,
      "district_code",
      "yield_kg_ha",
    );
    expect(lookup.get("RW-01")).toBe(1200);
    expect(lookup.get("RW-02")).toBeNull();
    expect(lookup.has("RW-02")).toBe(true);
    expect(lookup.get("RW-99")).toBeUndefined();
    expect(lookup.size).toBe(2);
  });
});

describe("period-coded adapter", () => {
  it("normalises `/productivity/trend` points onto the shared shape", () => {
    const adapted = fromPeriodCoded([
      { period_code: "2026B", label: "2026 Season B", values: { yield_kg_ha: 1300 } },
    ]);
    expect(adapted).toEqual([
      { period: "2026B", label: "2026 Season B", values: { yield_kg_ha: 1300 } },
    ]);
  });

  it("makes a district series comparable once adapted", () => {
    const adapted = fromPeriodCoded([
      { period_code: "2025B", values: { yield_kg_ha: 1000 } },
      { period_code: "2026B", values: { yield_kg_ha: 1300 } },
    ]);
    const change = sameSeasonChange(adapted, "yield_kg_ha");
    expect(change?.current.period).toBe("2026B");
    expect(change?.changePct).toBeCloseTo(30, 6);
  });
});
