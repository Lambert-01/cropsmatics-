import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapLegend } from "@/features/maps/MapLegend";
import { NO_DATA_COLOR, makeScale } from "@/features/maps/colors";
import { PRIORITY_BAND_FILL } from "@/lib/constants";

type LegendProps = Parameters<typeof MapLegend>[0];

const legend = (scale: ReturnType<typeof makeScale>, extra: Partial<LegendProps> = {}) =>
  renderToStaticMarkup(
    createElement(MapLegend, {
      scale,
      unit: "kg/ha",
      higherIs: "better",
      noDataLabel: "No verified data",
      ...extra,
    } satisfies LegendProps),
  );

describe("map colour scale", () => {
  it("paints a district with no published value the shared no-data colour", () => {
    const scale = makeScale(0, 100, "worse");
    expect(scale.color(null)).toBe(NO_DATA_COLOR);
    expect(scale.color(undefined)).toBe(NO_DATA_COLOR);
    expect(scale.color(Number.NaN)).toBe(NO_DATA_COLOR);
  });

  it("stays inside the published range at both ends", () => {
    const scale = makeScale(10, 20, "worse");
    expect(scale.min).toBe(10);
    expect(scale.max).toBe(20);
    // A value beyond either end is clamped, not extrapolated past the palette.
    expect(scale.color(-5)).toBe(scale.color(10));
    expect(scale.color(99)).toBe(scale.color(20));
  });

  it("reverses the palette for a metric where higher is better", () => {
    const better = makeScale(0, 100, "better");
    const worse = makeScale(0, 100, "worse");
    expect(better.stops).toEqual([...worse.stops].reverse());
    expect(better.color(100)).not.toBe(worse.color(100));
  });

  it("reports whether a range was published at all", () => {
    expect(makeScale(0, 100, "worse").published).toBe(true);
    // The API returns null endpoints when the metric has no value for the selection.
    expect(makeScale(null, null, "worse").published).toBe(false);
    expect(makeScale(undefined, undefined, "worse").published).toBe(false);
  });

  it("keeps interpolation stops even with no published range", () => {
    // The gradient needs stops to draw; the legend is what must stay honest, and
    // `published` is the flag it reads.
    expect(makeScale(null, null, "sequential").stops.length).toBeGreaterThan(1);
  });

  it("centres a diverging scale on zero rather than on the range midpoint", () => {
    const scale = makeScale(-20, 80, "diverging", [-20, 0, 80]);
    expect(scale.kind).toBe("diverging");
    expect(scale.hasZero).toBe(true);
    // Zero is the benchmark, so it must be the neutral stop, and the two sides get
    // their own spans: a below-benchmark value is not tinted by the far-larger gap
    // on the other side.
    const neutral = scale.color(0);
    expect(scale.color(-20)).not.toBe(neutral);
    expect(scale.color(80)).not.toBe(neutral);
    expect(scale.color(-20)).not.toBe(scale.color(80));
  });

  it("flags a scope whose every district shares one published value", () => {
    const scale = makeScale(1200, 1200, "sequential", [1200, 1200]);
    expect(scale.flat).toBe(true);
    expect(scale.hasZero).toBe(false);
    expect(scale.color(1200)).toBe(scale.color(1200));
  });

  it("colours a banded score from the API's band, not from a gradient", () => {
    const scale = makeScale(0, 1, "bands");
    expect(scale.kind).toBe("bands");
    expect(scale.bands.map((b) => b.band)).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
    // The API's own label wins.
    expect(scale.colorForBand("HIGH", 0.1)).toBe(PRIORITY_BAND_FILL.HIGH);
    // A score with no label is placed with the published thresholds.
    expect(scale.colorForBand(null, 0.9)).toBe(PRIORITY_BAND_FILL.CRITICAL);
    // No score and no label is unavailable, never the lowest band.
    expect(scale.colorForBand(null, null)).toBe(NO_DATA_COLOR);
    expect(scale.color(null)).toBe(NO_DATA_COLOR);
  });
});

describe("map legend", () => {
  it("prints the published endpoints and the unit", () => {
    const html = legend(makeScale(500, 2400, "better"));
    expect(html).toContain("500");
    expect(html).toContain("2400");
    expect(html).toContain("kg/ha");
    expect(html).toContain("higher = better");
  });

  it("does not print a range the API never published", () => {
    const html = legend(makeScale(null, null, "better"));
    expect(html).toContain("No published range");
    // 0 and 1 are the interpolation fallback, not published endpoints.
    expect(html).not.toContain(">0<");
    expect(html).not.toContain(">1<");
  });

  it("always carries a distinct entry for missing data", () => {
    for (const scale of [makeScale(0, 100, "worse"), makeScale(null, null, "worse")]) {
      const html = legend(scale);
      expect(html).toContain("No verified data");
      expect(html).toContain(NO_DATA_COLOR);
    }
  });

  it("states the metric's own direction instead of one generic phrase", () => {
    const html = legend(makeScale(0, 100, "sequential"), {
      higherIs: "neutral",
      direction: "darker = more farmers reporting irrigation",
    });
    expect(html).toContain("darker = more farmers reporting irrigation");
    expect(html).not.toContain("higher = larger gap");
  });

  it("marks zero as the benchmark on a diverging bar", () => {
    const html = legend(makeScale(-20, 80, "diverging"), { unit: "%" });
    expect(html).toContain("0 is the benchmark");
  });

  it("says when a selection has only one published value", () => {
    const html = legend(makeScale(1200, 1200, "sequential"), { unit: "kg/ha" });
    expect(html).toContain("One published value");
    expect(html).toContain("1200");
  });

  it("lists score bands and denies that the score is a probability", () => {
    const html = legend(makeScale(0, 1, "bands"), {
      unit: "score (0-1)",
      higherIs: "neutral",
      direction: "banded planning score — not a probability",
    });
    expect(html).toContain("Critical");
    expect(html).toContain("≥ 0.75");
    expect(html).toContain("not a probability");
    expect(html).toContain(PRIORITY_BAND_FILL.MEDIUM);
  });

  it("explains the pattern overlay only while an overlay is drawn", () => {
    const withOverlay = legend(makeScale(0, 100, "sequential"), { overlay: "Yield gap ≥ 20%" });
    expect(withOverlay).toContain("Yield gap ≥ 20%");
    expect(legend(makeScale(0, 100, "sequential"))).not.toContain("Yield gap");
  });

  it("lets a caller distinguish unavailable-for-this-period from unobserved", () => {
    const html = legend(makeScale(null, null, "sequential"), {
      noDataLabel: "Not published for this period",
    });
    expect(html).toContain("Not published for this period");
  });
});
