import { describe, expect, it } from "vitest";

import { divergingBar, hasNegative, maxMagnitude, MIN_BAR_PCT } from "../src/utils/diverging";

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
