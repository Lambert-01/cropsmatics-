import { describe, expect, it } from "vitest";

import {
  buildPracticeSeries,
  practiceIndicatorLabel,
  PRACTICE_DOMAIN_LABELS,
  practiceSpan,
} from "@/lib/practiceIndicators";
import type { PracticeObservation } from "@/types";

function obs(
  district: string | null,
  geography_level: string,
  domain: string,
  indicator_code: string,
  period_code: string,
  value: number | null,
): PracticeObservation {
  return {
    period_code,
    year: null,
    season: null,
    geography_level,
    district,
    district_code: district ? district.toLowerCase() : null,
    province: null,
    domain,
    indicator_code,
    value,
    unit: "percent",
    source_id: "NISR_SAS_TEST",
    source_sheet: "Sheet1",
  };
}

const OBSERVATIONS: PracticeObservation[] = [
  obs("Gasabo", "DISTRICT", "irrigation", "drip_irrigation_pct", "2024A", 0),
  obs("Gasabo", "DISTRICT", "irrigation", "drip_irrigation_pct", "2025A", 2.04),
  obs("Bugesera", "DISTRICT", "irrigation", "drip_irrigation_pct", "2024A", 12.5),
  obs("Bugesera", "DISTRICT", "irrigation", "drip_irrigation_pct", "2025A", 9.9),
  obs(null, "NATIONAL", "irrigation", "drip_irrigation_pct", "2024A", 4.2),
];

const PERIODS = ["2025A", "2024A", "2024C"];

describe("practiceIndicatorLabel", () => {
  it("names the denominator a practice was published for", () => {
    expect(practiceIndicatorLabel("improved_seed_farmers")).toBe("Improved seed of farmers");
    expect(practiceIndicatorLabel("improved_seed_land")).toBe("Improved seed of land");
    expect(practiceIndicatorLabel("improved_seed_plots")).toBe("Improved seed of plots");
  });

  it("labels share indicators without a denominator", () => {
    expect(practiceIndicatorLabel("drip_irrigation_pct")).toBe("Drip irrigation");
    expect(practiceIndicatorLabel("traditional_irrigation_pct")).toBe("Traditional irrigation");
  });

  it("falls back to the readable raw code for an unknown code", () => {
    // The whole code, suffix included: the percent unit is real information
    // and a guessed label would read as authoritative.
    expect(practiceIndicatorLabel("quantum_yield_pct")).toBe("quantum yield pct");
  });
});

describe("buildPracticeSeries", () => {
  it("never mixes districts: a district chart uses only that district's rows", () => {
    const series = buildPracticeSeries(OBSERVATIONS, PERIODS, "Gasabo");
    expect(series).toHaveLength(1);
    expect(series[0].points.map((p) => p.value)).toEqual([0, null, 2.04]);
  });

  it("draws national rows only when no district is selected", () => {
    const series = buildPracticeSeries(OBSERVATIONS, PERIODS, null);
    expect(series).toHaveLength(1);
    expect(series[0].points.map((p) => p.value)).toEqual([4.2, null, null]);
  });

  it("orders releases chronologically regardless of the response order", () => {
    const series = buildPracticeSeries(OBSERVATIONS, PERIODS, "Bugesera");
    expect(series[0].points.map((p) => p.period)).toEqual(["2024A", "2024C", "2025A"]);
    expect(series[0].points.map((p) => p.value)).toEqual([12.5, null, 9.9]);
  });

  it("keeps a published 0 as a real zero, not a gap", () => {
    const series = buildPracticeSeries(OBSERVATIONS, ["2024A"], "Gasabo");
    expect(series[0].points).toEqual([{ period: "2024A", value: 0 }]);
  });

  it("returns nothing for a district with no rows", () => {
    expect(buildPracticeSeries(OBSERVATIONS, PERIODS, "Huye")).toEqual([]);
  });
});

describe("PRACTICE_DOMAIN_LABELS", () => {
  it("covers the five published domains, including the real 'practice' key", () => {
    // Regression: the previous panel labelled the domain "practices", which is
    // not what the API publishes, so the selector showed a raw domain code.
    expect(Object.keys(PRACTICE_DOMAIN_LABELS).sort()).toEqual([
      "erosion_control",
      "erosion_severity",
      "irrigation",
      "practice",
      "water_source",
    ]);
  });
});

describe("practiceSpan", () => {
  it("reports the published span", () => {
    expect(practiceSpan(["2026B", "2024A", "2025B"])).toBe("2024A-2026B");
  });

  it("returns null when nothing is published", () => {
    expect(practiceSpan([])).toBeNull();
  });
});
