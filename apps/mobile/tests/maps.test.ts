import { describe, expect, it } from "vitest";
import { resolveDistrictRouteParam } from "../src/utils/selection";
import { layerRequiresCrop, linkPeriodToLayer, periodsCarryingLayer, releaseLabel } from "../src/utils/coverage";
import type { PeriodInfo } from "../src/types";
import { bandIndex, bandPaletteIndex, bandsFor, formatBand, quantileCuts, scaleForLayer } from "../src/utils/scale";
import { MAX_SCALE, MIN_SCALE, ZOOM_STEP, canZoomIn, canZoomOut, clampScale, clampTransform, isDefaultTransform, panBy, resetTransform, scaleTo, zoomBy } from "../src/utils/mapTransform";

// merged from map-district-param.test.ts
const CATALOGUE = [
  { district_code: "KGL" },
  { district_code: "HUY" },
  { district_code: "MUS" },
];

describe("resolveDistrictRouteParam", () => {
  it("selects a code that is in the published catalogue", () => {
    expect(resolveDistrictRouteParam("HUY", CATALOGUE)).toEqual({ action: "select", code: "HUY" });
  });

  it("reports a code that is not a district as unknown, never as unpublished", () => {
    expect(resolveDistrictRouteParam("ZZZ", CATALOGUE)).toEqual({ action: "unknown", code: "ZZZ" });
  });

  it("ignores a missing param", () => {
    expect(resolveDistrictRouteParam(null, CATALOGUE)).toEqual({ action: "ignore", code: null });
    expect(resolveDistrictRouteParam(undefined, CATALOGUE)).toEqual({ action: "ignore", code: null });
    expect(resolveDistrictRouteParam("", CATALOGUE)).toEqual({ action: "ignore", code: null });
  });

  it("treats every catalogue district as selectable, including unpublished ones", () => {
    // Whether the district has a value for the current layer is decided by the
    // response, not by this check: a real district with no value still opens
    // its sheet and says "Not published".
    for (const item of CATALOGUE) {
      expect(resolveDistrictRouteParam(item.district_code, CATALOGUE).action).toBe("select");
    }
  });
});


// merged from map-period-coverage.test.ts
function period(
  code: string,
  overrides: Partial<PeriodInfo> = {},
): PeriodInfo {
  return {
    period_code: code,
    year: Number(code.slice(0, 4)),
    season: code.slice(4),
    label: code,
    coverage_level: "district",
    n_districts: 30,
    n_crops: 17,
    is_latest: false,
    is_latest_district: false,
    ...overrides,
  };
}

const PERIODS: PeriodInfo[] = [
  period("2024A"),
  period("2024B"),
  period("2025A"),
  period("2025B", {
    datasets: [
      { dataset: "district_factors", coverage_level: "district", n_districts: 30, n_crops: 0 },
    ],
  }),
];

describe("periodsCarryingLayer", () => {
  it("offers every district period to a multi-period layer", () => {
    expect(periodsCarryingLayer(PERIODS, "gap").map((p) => p.period_code)).toEqual([
      "2024A",
      "2024B",
      "2025A",
      "2025B",
    ]);
  });

  it("restricts a single-release layer to the period that carries it", () => {
    expect(periodsCarryingLayer(PERIODS, "input_adoption").map((p) => p.period_code)).toEqual([
      "2025B",
    ]);
  });

  it("treats a national-only period as not carrying a district layer", () => {
    const nationalOnly = [period("2026A", { coverage_level: "national", n_districts: 0 })];
    expect(periodsCarryingLayer(nationalOnly, "yield")).toEqual([]);
  });
});

describe("linkPeriodToLayer", () => {
  it("follows the chart period when the layer covers it", () => {
    expect(linkPeriodToLayer(PERIODS, "gap", "2024B")).toEqual({
      periodCode: "2024B",
      reason: null,
      reasonCode: null,
      reasonPeriods: { requested: "2024B", fallback: null },
    });
  });

  it("stays on a published period and explains why when the layer does not cover it", () => {
    const decision = linkPeriodToLayer(PERIODS, "input_adoption", "2024A");
    expect(decision.periodCode).toBe("2025B");
    expect(decision.reason).toContain("not published at district level");
    expect(decision.reasonCode).toBe("not-district");
    expect(decision.reasonPeriods).toEqual({ requested: "2024A", fallback: "2025B" });
  });

  it("returns to the map's own selection when no chart period is given", () => {
    expect(linkPeriodToLayer(PERIODS, "gap", null)).toEqual({
      periodCode: null,
      reason: null,
      reasonCode: null,
      reasonPeriods: { requested: null, fallback: null },
    });
  });

  it("says so when no period carries the layer at all", () => {
    const decision = linkPeriodToLayer([period("2024A")], "input_adoption", "2024A");
    expect(decision.periodCode).toBeNull();
    expect(decision.reason).toMatch(/No published period carries this layer/);
    expect(decision.reasonCode).toBe("no-period");
  });
});

describe("layerRequiresCrop", () => {
  it("only the raw yield layer needs a crop", () => {
    expect(layerRequiresCrop("yield")).toBe(true);
    expect(layerRequiresCrop("gap")).toBe(false);
  });
});

describe("releaseLabel", () => {
  it("normalises a YYYY-S release id to the catalogue label", () => {
    expect(releaseLabel("2025-B", [{ ...period("2025B"), label: "2025 Season B" }])).toBe(
      "2025 Season B",
    );
  });

  it("passes an unknown release through unchanged", () => {
    expect(releaseLabel("2099-X", PERIODS)).toBe("2099-X");
  });

  it("returns null for a missing release", () => {
    expect(releaseLabel(null, PERIODS)).toBeNull();
  });
});


// merged from map-scale-consistency.test.ts
const VALUES = [10, 12, 15, 18, 22, 27, 33, 40, 48, 61];

describe("classification consistency", () => {
  it("puts a value in the same class the legend labels it", () => {
    const { cuts, bands } = bandsFor(VALUES, 5);
    for (const value of VALUES) {
      const index = bandIndex(value, cuts);
      const band = bands.find((b) => b.index === index);
      expect(band, `value ${value} has no band`).toBeDefined();
      // The band's own bound rules must contain the value.
      if (band!.lower !== null) expect(value).toBeGreaterThan(band!.lower);
      if (band!.upper !== null) expect(value).toBeLessThanOrEqual(band!.upper);
    }
  });

  it("produces contiguous legend bands (no gap between classes)", () => {
    const { bands } = bandsFor(VALUES, 5);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].lower).toBe(bands[i - 1].upper);
    }
    expect(bands[0].lower).toBeNull();
    expect(bands[bands.length - 1].upper).toBeNull();
  });

  it("counts every finite value exactly once", () => {
    const { bands } = bandsFor(VALUES, 5);
    expect(bands.reduce((sum, band) => sum + band.count, 0)).toBe(VALUES.length);
  });

  it("clamps the palette slot to the number of available swatches", () => {
    const cuts = quantileCuts(VALUES, 5);
    for (const value of VALUES) {
      expect(bandPaletteIndex(value, cuts, 5)).toBeLessThanOrEqual(4);
    }
    // A single-colour ramp still classifies without an out-of-range index.
    expect(bandPaletteIndex(VALUES[VALUES.length - 1], cuts, 1)).toBe(0);
  });

  it("collapses a constant layer to one class that contains every value", () => {
    const { cuts, bands } = bandsFor([7, 7, 7], 5);
    expect(bands).toHaveLength(1);
    expect(bands[0].lower).toBeNull();
    expect(bands[0].count).toBe(3);
    // Every value still classifies into that single band.
    for (const value of [7, 7, 7]) expect(bandIndex(value, cuts)).toBe(0);
    expect(formatBand(bands[0], (v) => String(v))).toBe(`\u2264 7`);
  });
});

describe("scale direction", () => {
  it("treats burden metrics as higher-is-worse and everything else as better", () => {
    expect(scaleForLayer("gap").direction).toBe("higherIsWorse");
    expect(scaleForLayer("priority").direction).toBe("higherIsWorse");
    expect(scaleForLayer("yield").direction).toBe("higherIsBetter");
    expect(scaleForLayer("irrigation").direction).toBe("higherIsBetter");
  });
});


// merged from map-transform.test.ts
const W = 320;
const H = 400;

describe("clampScale", () => {
  it("keeps the scale inside the supported range", () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(1.5)).toBe(1.5);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });

  it("recovers from a non-finite scale instead of producing NaN geometry", () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    // An infinity is a direction, not a corrupt value: a pinch spike clamps to
    // the bound instead of snapping the user back to scale 1.
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(MIN_SCALE);
  });
});

describe("clampTransform", () => {
  it("forces the offset to zero at scale 1, so the map cannot be dragged away", () => {
    expect(clampTransform({ scale: 1, x: 40, y: -60 }, W, H)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it("allows exactly the half-extent scaling added, and no more", () => {
    // scale 2 adds (2-1)*W of extra width, so the offset limit is half of that:
    // 160 across and 200 down.
    const clamped = clampTransform({ scale: 2, x: 999, y: -999 }, W, H);
    expect(clamped.x).toBe(160);
    expect(clamped.y).toBe(-200);
  });

  it("keeps an offset that is already legal", () => {
    expect(clampTransform({ scale: 2, x: 10, y: -20 }, W, H)).toEqual({
      scale: 2,
      x: 10,
      y: -20,
    });
  });

  it("never leaves a gap at the container edge after clamping", () => {
    const t = clampTransform({ scale: 3, x: 10_000, y: 10_000 }, W, H);
    // The scaled half-extent must be at least the requested offset plus the
    // viewport half-extent, which is what "covers the viewport" means.
    expect(Math.abs(t.x)).toBeLessThanOrEqual(((t.scale - 1) * W) / 2);
    expect(Math.abs(t.y)).toBeLessThanOrEqual(((t.scale - 1) * H) / 2);
  });

  it("survives a zero-size container (before first layout)", () => {
    expect(clampTransform({ scale: 2, x: 50, y: 50 }, 0, 0)).toEqual({
      scale: 2,
      x: 0,
      y: 0,
    });
  });
});

describe("zoomBy", () => {
  it("zooms in one step and clamps at the maximum", () => {
    const zoomed = zoomBy(resetTransform(), ZOOM_STEP, W, H);
    expect(zoomed.scale).toBe(ZOOM_STEP);
    let t = resetTransform();
    for (let i = 0; i < 10; i += 1) t = zoomBy(t, ZOOM_STEP, W, H);
    expect(t.scale).toBe(MAX_SCALE);
  });

  it("zooms out and stops at scale 1", () => {
    let t = zoomBy(resetTransform(), 2, W, H);
    t = zoomBy(t, 1 / ZOOM_STEP, W, H);
    expect(t.scale).toBeCloseTo(1.333, 3);
    for (let i = 0; i < 10; i += 1) t = zoomBy(t, 1 / ZOOM_STEP, W, H);
    expect(t.scale).toBe(MIN_SCALE);
    // Back at scale 1 the pan must be fully released.
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
  });
});

describe("scaleTo and panBy", () => {
  it("keeps the pan when pinching, and re-clamps it for the new scale", () => {
    const panned = panBy({ scale: 3, x: 0, y: 0 }, 100, 100, W, H);
    expect(panned).toEqual({ scale: 3, x: 100, y: 100 });
    const shrunk = scaleTo(panned, 1.2, W, H);
    expect(shrunk.scale).toBe(1.2);
    // The old 100px pan is no longer reachable at this scale, so it tightens to
    // the new limit: (1.2 - 1) * W / 2 and (1.2 - 1) * H / 2.
    expect(shrunk.x).toBeCloseTo(32, 6);
    expect(shrunk.y).toBeCloseTo(40, 6);
  });

  it("accumulates pan deltas, and clamps only once the limit is passed", () => {
    let t = scaleTo(resetTransform(), 2, W, H);
    t = panBy(t, 50, 0, W, H);
    t = panBy(t, 50, 0, W, H);
    t = panBy(t, 50, 0, W, H);
    // 150px is still inside the 160px limit at scale 2.
    expect(t.x).toBe(150);
    t = panBy(t, 50, 0, W, H);
    expect(t.x).toBe(160);
  });

  it("ignores panning entirely at scale 1", () => {
    expect(panBy(resetTransform(), 200, 200, W, H)).toEqual(resetTransform());
  });
});

describe("control availability", () => {
  it("reports when zooming is possible and when a reset is needed", () => {
    const base = resetTransform();
    expect(canZoomIn(base)).toBe(true);
    expect(canZoomOut(base)).toBe(false);
    expect(isDefaultTransform(base)).toBe(true);

    const zoomed = zoomBy(base, 2, W, H);
    expect(canZoomOut(zoomed)).toBe(true);
    expect(isDefaultTransform(zoomed)).toBe(false);

    const maxed = zoomBy(base, MAX_SCALE * 2, W, H);
    expect(canZoomIn(maxed)).toBe(false);
  });
});
