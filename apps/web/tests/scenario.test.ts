import { describe, expect, it } from "vitest";

import {
  FALLBACK_RANKING_CRITERIA,
  formatScenarioValue,
  movementLabel,
  previousPeriod,
  scenarioCriteria,
} from "@/lib/scenario";

const PUBLISHED = ["2024A", "2024B", "2024C", "2025A", "2025B", "2025C", "2026A", "2026B"];

describe("previousPeriod", () => {
  it("prefers the same season one year earlier", () => {
    // Seasons are not a time series, so 2026B must compare with 2025B.
    expect(previousPeriod(PUBLISHED, "2026B")).toBe("2025B");
    expect(previousPeriod(PUBLISHED, "2025A")).toBe("2024A");
  });

  it("falls back to the preceding published period when that season is missing", () => {
    // 2025 Season A was never published, so 2026A has no same-season predecessor.
    const withGap = ["2024A", "2025B", "2026A"];
    expect(previousPeriod(withGap, "2026A")).toBe("2025B");
  });

  it("never returns the period it is comparing against", () => {
    for (const period of PUBLISHED) {
      expect(previousPeriod(PUBLISHED, period)).not.toBe(period);
    }
  });

  it("reports no comparison period for the earliest release", () => {
    // Nothing earlier exists, so comparing against a later period would be
    // backwards in time and is refused rather than silently substituted.
    expect(previousPeriod(PUBLISHED, "2024A")).toBe("");
  });

  it("is stable when there is no current selection", () => {
    expect(previousPeriod(PUBLISHED)).toBe("2026A");
    expect(previousPeriod([], "2026B")).toBe("");
  });
});

describe("formatScenarioValue", () => {
  it("renders a period code as a readable label", () => {
    expect(formatScenarioValue("2025B")).toBe("2025 Season B");
  });

  it("renders a benchmark strategy as a readable label", () => {
    expect(formatScenarioValue("national_crop_median")).toBe("National crop median");
  });

  it("treats an absent group as \"all\", not as an empty value", () => {
    expect(formatScenarioValue(null)).toBe("all");
    expect(formatScenarioValue("")).toBe("all");
    expect(formatScenarioValue(undefined)).toBe("all");
  });

  it("formats numbers and passes unknown strings through unchanged", () => {
    expect(formatScenarioValue(25)).toBe("25.0");
    expect(formatScenarioValue("Eastern")).toBe("Eastern");
  });
});

describe("scenarioCriteria", () => {
  it("prefers the API's authoritative criterion list", () => {
    const fromApi = [{ id: "yield_kg_ha", label: "Observed yield", unit: "kg/ha" }];
    expect(scenarioCriteria(fromApi)).toBe(fromApi);
  });

  it("falls back to the local list before the first response arrives", () => {
    expect(scenarioCriteria(undefined)).toBe(FALLBACK_RANKING_CRITERIA);
    expect(scenarioCriteria([])).toBe(FALLBACK_RANKING_CRITERIA);
    // The fallback must never be empty, or the control would render blank.
    expect(FALLBACK_RANKING_CRITERIA.length).toBeGreaterThan(0);
  });
});

describe("movementLabel", () => {
  it("describes relative position, never improvement or decline", () => {
    expect(movementLabel(2)).toBe("moved up 2");
    expect(movementLabel(-3)).toBe("moved down 3");
    expect(movementLabel(0)).toBe("held position");
    expect(movementLabel(null)).toBe("not comparable");
    expect(movementLabel(1)).not.toMatch(/improv|better|worse/i);
  });
});
