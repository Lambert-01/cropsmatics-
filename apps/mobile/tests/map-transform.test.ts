import { describe, expect, it } from "vitest";

import {
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_STEP,
  canZoomIn,
  canZoomOut,
  clampScale,
  clampTransform,
  isDefaultTransform,
  panBy,
  resetTransform,
  scaleTo,
  zoomBy,
} from "../src/utils/mapTransform";

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
