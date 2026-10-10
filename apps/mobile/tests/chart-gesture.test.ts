import { describe, expect, it } from "vitest";

import { GESTURE_SLOP, isScrubIntent, isTapMovement } from "../src/utils/chartGesture";

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
