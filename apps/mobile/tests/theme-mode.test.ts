import { describe, expect, it } from "vitest";

import { features } from "../src/config/features";
import { colors, darkColors, makeTypography, palettes, toggledAppearance } from "../src/theme";

/**
 * Dark mode is a user-facing feature, not a hidden flag.
 *
 * These assertions pin the two things that were previously false: the feature is
 * enabled by default, and the dark palette is a real, distinct, darker scheme —
 * not a copy of the light one with a couple of tokens changed.
 */

/** Channel ratio of a `#rrggbb` literal: 0 is black, 1 is white. */
function lightness(hex: string): number {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r + g + b) / (3 * 255);
}

describe("dark mode availability", () => {
  it("is enabled by default", () => {
    expect(features.darkMode).toBe(true);
  });

  it("exposes both palettes", () => {
    expect(palettes.light).toBe(colors);
    expect(palettes.dark).toBe(darkColors);
  });
});

describe("dark palette", () => {
  it("uses genuinely darker surfaces than the light palette", () => {
    expect(lightness(darkColors.background)).toBeLessThan(lightness(colors.background));
    expect(lightness(darkColors.surface)).toBeLessThan(lightness(colors.surface));
  });

  it("turns foreground text light", () => {
    // forestDeep is the primary body/heading ink; in dark mode it must be light.
    expect(lightness(darkColors.forestDeep)).toBeGreaterThan(0.7);
    expect(lightness(colors.forestDeep)).toBeLessThan(0.3);
  });

  it("keeps the primary action colour legible on white text", () => {
    // A solid primary button keeps white text, so primary must stay saturated.
    expect(lightness(darkColors.primary)).toBeLessThan(0.7);
  });

  it("toggles to the opposite explicit scheme, never back to system", () => {
    expect(toggledAppearance("dark")).toBe("light");
    expect(toggledAppearance("light")).toBe("dark");
  });

  it("bakes the dark foreground into typography", () => {
    const typography = makeTypography(darkColors);
    expect(typography.h1.color).toBe(darkColors.textPrimary);
    expect(typography.body.color).toBe(darkColors.textSecondary);
    expect(typography.numericCard.color).toBe(darkColors.kpiValue);
    // ...and does not leak light-mode ink.
    expect(typography.h1.color).not.toBe(colors.forestDeep);
  });
});
