import { describe, expect, it } from "vitest";

import { figureContext, formatFigureValue } from "../src/utils/askAnswer";

describe("formatFigureValue", () => {
  it("keeps the unit the API published the value under", () => {
    expect(formatFigureValue(1.25, "t/ha")).toBe("1.25 t/ha");
    expect(formatFigureValue(12000, "MT")).toBe("12,000 MT");
  });

  it("shows a missing observation as an em dash, never as zero", () => {
    expect(formatFigureValue(null, "t/ha")).toBe("—");
    expect(formatFigureValue(undefined, "t/ha")).toBe("—");
  });

  it("never coerces a non-numeric payload into a number", () => {
    // A value that arrived as text is shown as it arrived.
    expect(formatFigureValue("Not published")).toBe("Not published");
    expect(formatFigureValue(NaN)).toBe("NaN");
  });

  it("does not append the unit when there is no value to show", () => {
    // Guard explicitly: "— t/ha" would read as a published zero-ish figure.
    expect(formatFigureValue(null, "t/ha")).not.toContain("t/ha");
  });

  it("trims precision as the magnitude grows", () => {
    expect(formatFigureValue(1.23456)).toBe("1.235");
    expect(formatFigureValue(12.3456)).toBe("12.35");
    expect(formatFigureValue(123.456)).toBe("123.5");
    expect(formatFigureValue(1234.56)).toBe("1,235");
  });
});

describe("figureContext", () => {
  it("joins the crop, district and period a figure belongs to", () => {
    expect(
      figureContext({ value: 1, crop: "Maize", district: "Ngoma", period_code: "2024A" }),
    ).toBe("Maize · Ngoma · 2024A");
  });

  it("omits the parts a figure does not carry", () => {
    expect(figureContext({ value: 1, district: "Ngoma" })).toBe("Ngoma");
    expect(figureContext({ value: 1, crop: "Beans", period_code: "2024A" })).toBe("Beans · 2024A");
  });

  it("returns null when there is no context, so no empty line is rendered", () => {
    expect(figureContext({ value: 1 })).toBeNull();
    expect(figureContext({ value: 1, crop: null, district: null, period_code: null })).toBeNull();
  });
});
