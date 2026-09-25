import { describe, expect, it } from "vitest";

import { RISK, riskStyle } from "@/lib/theme";

describe("riskStyle", () => {
  it("maps every band to colour + icon + label", () => {
    for (const band of ["LOW", "MODERATE", "HIGH"] as const) {
      const s = riskStyle(band);
      expect(s).toBe(RISK[band]);
      expect(s.icon.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("is case-insensitive and falls back safely", () => {
    expect(riskStyle("high").label).toBe("High");
    expect(riskStyle(null).label).toBe("Moderate");
    expect(riskStyle("nonsense").label).toBe("Moderate");
  });
});
