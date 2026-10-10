import { describe, expect, it } from "vitest";

import { buildCropShareText } from "../src/utils/shareCrop";
import type { CropShareInput } from "../src/utils/shareCrop";

const T = {
  heading: "{crop} — Cropmatics Rwanda",
  series: "National series: {first} to {last}",
  metric: "{metric}: {value}{unit} ({period})",
  source: "Source: {source}",
  note: "Published values only — nothing on this card is estimated.",
};

const FULL: CropShareInput = {
  crop: "Maize",
  periods: ["2024A", "2024B", "2025A"],
  metricLabel: "Yield",
  value: 1.4,
  unit: "t/ha",
  valuePeriod: "2025 Season A",
  source: "NISR Season A 2025",
  t: T,
};

describe("buildCropShareText", () => {
  it("carries identity, axis bounds, the published figure and its source", () => {
    const text = buildCropShareText(FULL);
    expect(text).toContain("Maize — Cropmatics Rwanda");
    expect(text).toContain("National series: 2024A to 2025A");
    expect(text).toContain("Yield: 1.4 t/ha (2025 Season A)");
    expect(text).toContain("Source: NISR Season A 2025");
    expect(text).toContain(T.note);
  });

  it("omits the metric line when nothing is published", () => {
    const text = buildCropShareText({ ...FULL, value: null });
    expect(text).not.toContain("Yield:");
    expect(text).toContain("Maize");
    expect(text).toContain(T.note);
  });

  it("omits the series line when the axis is empty", () => {
    const text = buildCropShareText({ ...FULL, periods: [] });
    expect(text).not.toContain("National series:");
  });

  it("omits the source line when none is published", () => {
    const text = buildCropShareText({ ...FULL, source: null });
    expect(text).not.toContain("Source:");
  });

  it("drops the unit when the API published the value without one", () => {
    const text = buildCropShareText({ ...FULL, unit: null });
    expect(text).toContain("Yield: 1.4 (2025 Season A)");
  });

  it("never invents a figure for a non-finite value", () => {
    const text = buildCropShareText({ ...FULL, value: Number.NaN });
    expect(text).not.toContain("Yield:");
  });
});
