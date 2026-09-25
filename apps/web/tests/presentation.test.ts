import { describe, expect, it } from "vitest";

import { priorityBand, PRIORITY_BANDS } from "@/lib/constants";
import { benchmarkLabel, fmtNumber, periodLabel } from "@/lib/format";
import { riskStyle } from "@/lib/theme";

describe("priorityBand", () => {
  it("maps each band to colour + icon + text", () => {
    for (const band of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
      const b = priorityBand(band);
      expect(b).toBe(PRIORITY_BANDS[band]);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.className.length).toBeGreaterThan(0);
    }
  });

  it("falls back safely for unknown or missing bands", () => {
    expect(priorityBand(null).label).toBe("Low");
    expect(priorityBand("nonsense").label).toBe("Low");
    expect(priorityBand("critical").label).toBe("Critical");
  });
});

describe("riskStyle", () => {
  it("never communicates risk by colour alone", () => {
    for (const band of ["LOW", "MODERATE", "HIGH"] as const) {
      const s = riskStyle(band);
      expect(s.icon).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.hint).toBeTruthy();
    }
  });
});

describe("formatting", () => {
  it("renders missing values as an em dash, never zero", () => {
    expect(fmtNumber(null)).toBe("—");
    expect(fmtNumber(undefined)).toBe("—");
    expect(fmtNumber(Number.NaN)).toBe("—");
  });

  it("formats numbers and periods for display", () => {
    expect(fmtNumber(1234.56, 1)).toBe("1,234.6");
    expect(periodLabel("2025B")).toBe("2025 Season B");
    expect(periodLabel(null)).toBe("—");
    expect(benchmarkLabel("top_quartile_comparable_districts")).toBe(
      "Top-quartile comparable districts",
    );
  });
});
