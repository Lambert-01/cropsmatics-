import { describe, expect, it } from "vitest";

import { en, rw } from "../src/i18n";
import type { PracticeObservation } from "../src/types";
import {
  districtIndicatorSeries,
  districtIndicators,
  domainLabelKey,
  indicatorBasisKey,
  indicatorLabelKey,
  observedDistricts,
  PRACTICE_DOMAINS,
  practiceCoverage,
  sortPracticePeriods,
} from "../src/utils/practiceIndicators";

function obs(
  district: string,
  domain: string,
  indicator_code: string,
  period_code: string,
  value: number | null,
): PracticeObservation {
  return {
    period_code,
    year: null,
    season: null,
    geography_level: "DISTRICT",
    district,
    district_code: district.toLowerCase(),
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
  obs("Gasabo", "irrigation", "drip_irrigation_pct", "2024A", 0),
  obs("Gasabo", "irrigation", "drip_irrigation_pct", "2025A", 2.04),
  obs("Gasabo", "irrigation", "drip_irrigation_pct", "2025B", 5.26),
  // 2024C was never published for Gasabo drip irrigation: no row at all.
  obs("Gasabo", "irrigation", "traditional_irrigation_pct", "2024A", 80.0),
  obs("Gasabo", "irrigation", "traditional_irrigation_pct", "2024C", null),
  obs("Gasabo", "practice", "improved_seed_farmers", "2024A", 41.0),
  obs("Bugesera", "irrigation", "drip_irrigation_pct", "2024A", 12.5),
];

const PERIODS = ["2024A", "2024C", "2025A", "2025B"];

describe("sortPracticePeriods", () => {
  it("orders the published codes chronologically", () => {
    expect(sortPracticePeriods(["2026B", "2024A", "2025C", "2024B"])).toEqual([
      "2024A",
      "2024B",
      "2025C",
      "2026B",
    ]);
  });
});

describe("practiceCoverage", () => {
  it("reports the published span", () => {
    expect(practiceCoverage(["2025B", "2024A", "2026B"])).toEqual({
      first: "2024A",
      last: "2026B",
    });
  });

  it("returns null when nothing is published", () => {
    expect(practiceCoverage([])).toBeNull();
  });
});

describe("districtIndicatorSeries", () => {
  it("returns every requested release in chronological order", () => {
    expect(
      districtIndicatorSeries(OBSERVATIONS, "Gasabo", "drip_irrigation_pct", PERIODS),
    ).toEqual([
      { period: "2024A", value: 0 },
      { period: "2024C", value: null },
      { period: "2025A", value: 2.04 },
      { period: "2025B", value: 5.26 },
    ]);
  });

  it("keeps a published 0 as a real zero, not a gap", () => {
    const series = districtIndicatorSeries(
      OBSERVATIONS,
      "Gasabo",
      "drip_irrigation_pct",
      ["2024A"],
    );
    expect(series).toEqual([{ period: "2024A", value: 0 }]);
  });

  it("keeps a missing release and a published null alike as gaps", () => {
    const series = districtIndicatorSeries(
      OBSERVATIONS,
      "Gasabo",
      "traditional_irrigation_pct",
      ["2024A", "2024C", "2025A"],
    );
    expect(series).toEqual([
      { period: "2024A", value: 80.0 },
      { period: "2024C", value: null },
      { period: "2025A", value: null },
    ]);
  });

  it("never borrows another district's value", () => {
    expect(
      districtIndicatorSeries(OBSERVATIONS, "Bugesera", "drip_irrigation_pct", PERIODS),
    ).toEqual([
      { period: "2024A", value: 12.5 },
      { period: "2024C", value: null },
      { period: "2025A", value: null },
      { period: "2025B", value: null },
    ]);
  });

  it("never borrows another indicator's value", () => {
    expect(
      districtIndicatorSeries(OBSERVATIONS, "Gasabo", "flood_irrigation_pct", ["2024A"]),
    ).toEqual([{ period: "2024A", value: null }]);
  });
});

describe("districtIndicators", () => {
  it("offers only the indicators this district has a published value for", () => {
    expect(districtIndicators(OBSERVATIONS, "Gasabo", "irrigation")).toEqual([
      "drip_irrigation_pct",
      "traditional_irrigation_pct",
    ]);
  });

  it("does not mix domains or districts", () => {
    expect(districtIndicators(OBSERVATIONS, "Gasabo", "practice")).toEqual([
      "improved_seed_farmers",
    ]);
    expect(districtIndicators(OBSERVATIONS, "Bugesera", "practice")).toEqual([]);
    expect(districtIndicators(OBSERVATIONS, "Bugesera", "irrigation")).toEqual([
      "drip_irrigation_pct",
    ]);
  });

  it("keeps known codes ahead of unknown ones, both alphabetical", () => {
    const rows = [
      ...OBSERVATIONS,
      obs("Gasabo", "irrigation", "zzz_new_method_pct", "2024A", 3.0),
      obs("Gasabo", "irrigation", "aaa_new_method_pct", "2024A", 4.0),
    ];
    expect(districtIndicators(rows, "Gasabo", "irrigation")).toEqual([
      "drip_irrigation_pct",
      "traditional_irrigation_pct",
      "aaa_new_method_pct",
      "zzz_new_method_pct",
    ]);
  });
});

describe("observedDistricts", () => {
  it("lists the districts that carry any published value, alphabetically", () => {
    expect(observedDistricts(OBSERVATIONS)).toEqual(["Bugesera", "Gasabo"]);
  });

  it("ignores rows without a district", () => {
    const national: PracticeObservation = {
      period_code: "2024A",
      year: null,
      season: null,
      geography_level: "NATIONAL",
      district: null,
      district_code: null,
      province: null,
      domain: "irrigation",
      indicator_code: "drip_irrigation_pct",
      value: 9.9,
      unit: "percent",
      source_id: "NISR_SAS_TEST",
      source_sheet: "Sheet1",
    };
    expect(observedDistricts([...OBSERVATIONS, national])).toEqual(["Bugesera", "Gasabo"]);
  });
});

describe("labels", () => {
  it("maps every published domain to a dictionary key", () => {
    for (const item of PRACTICE_DOMAINS) {
      expect(en[item.key], item.domain).toBeTruthy();
      expect(rw[item.key], item.domain).toBeTruthy();
      expect(domainLabelKey(item.domain)).toBe(item.key);
    }
    expect(domainLabelKey("not_a_domain")).toBeNull();
  });

  it("maps practice codes to a base label plus a denominator", () => {
    expect(indicatorLabelKey("improved_seed_farmers")).toBe("improvedSeed");
    expect(indicatorBasisKey("improved_seed_farmers")).toBe("basisFarmers");
    expect(indicatorBasisKey("improved_seed_land")).toBe("basisLand");
    expect(indicatorBasisKey("improved_seed_plots")).toBe("basisPlots");
  });

  it("maps share indicators without a denominator suffix", () => {
    expect(indicatorLabelKey("drip_irrigation_pct")).toBe("dripIrrigation");
    expect(indicatorBasisKey("drip_irrigation_pct")).toBeNull();
  });

  it("falls back to null for a code it has never seen", () => {
    expect(indicatorLabelKey("quantum_yield_pct")).toBeNull();
    expect(indicatorBasisKey("quantum_yield_pct")).toBeNull();
  });

  it("resolves every mapped key in both dictionaries", () => {
    // A typo in a label map would otherwise surface as raw code text on a
    // phone, in either language.
    const keys = Object.keys(en);
    for (const item of PRACTICE_DOMAINS) {
      expect(keys.includes(item.key), item.key).toBe(true);
    }
    const codes = Object.keys(en);
    for (const code of PUBLISHED_CODES) {
      const key = indicatorLabelKey(code);
      expect(key, code).not.toBeNull();
      expect(codes.includes(key as string), `${code} -> ${key}`).toBe(true);
    }
  });
});

/**
 * The 44 indicator codes the practice panel actually publishes, as served by
 * `GET /analytics/practice-indicators?district=<name>` (verified against the
 * processed 2024A-2026B panel). The endpoint may add codes later - those fall
 * back to the raw code on screen - but removing one from the label map would
 * silently downgrade a published indicator to raw code text.
 */
const PUBLISHED_CODES = [
  "agroforestry_farmers",
  "beds_ridges_pct",
  "bench_terraces_pct",
  "cover_plants_pct",
  "ditches_pct",
  "drip_irrigation_pct",
  "erosion_control_adoption_pct",
  "erosion_control_moderate_rate_pct",
  "erosion_control_severe_rate_pct",
  "erosion_low_pct",
  "erosion_moderate_pct",
  "erosion_protection_farmers",
  "erosion_severe_pct",
  "erosion_very_low_pct",
  "flood_irrigation_pct",
  "improved_seed_farmers",
  "improved_seed_land",
  "improved_seed_plots",
  "inorganic_fertilizer_farmers",
  "inorganic_fertilizer_land",
  "inorganic_fertilizer_plots",
  "irrigation_farmers",
  "lake_stream_source_pct",
  "mechanization_farmers",
  "mulching_pct",
  "organic_fertilizer_farmers",
  "organic_fertilizer_land",
  "organic_fertilizer_plots",
  "others_pct",
  "pesticide_farmers",
  "pesticide_land",
  "pesticide_plots",
  "pivot_irrigation_pct",
  "progressive_terraces_pct",
  "rainwater_source_pct",
  "sprinkler_irrigation_pct",
  "surface_irrigation_pct",
  "traditional_irrigation_pct",
  "trees_windbreak_pct",
  "underground_source_pct",
  "water_catchment_source_pct",
  "water_channels_pct",
  "water_drainage_pct",
  "water_treatment_source_pct",
];
