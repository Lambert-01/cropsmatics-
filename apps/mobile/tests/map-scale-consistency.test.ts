import { describe, expect, it } from "vitest";

import {
  bandIndex,
  bandPaletteIndex,
  bandsFor,
  formatBand,
  quantileCuts,
  scaleForLayer,
} from "../src/utils/scale";

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
