import { describe, expect, it } from "vitest";

import {
  coverageLimitations,
  periodSpan,
  sortPeriods,
  type CoverageDetailRow,
} from "@/lib/coverage";

const ALL_PERIODS = ["2024A", "2024B", "2024C", "2025A", "2025B", "2025C", "2026A", "2026B"];

describe("period ordering", () => {
  it("sorts by year then season, not lexically by string", () => {
    // "2026A" < "2024C" lexically-above would be wrong: year dominates.
    expect(sortPeriods(["2026A", "2024C", "2025B", "2024A", "2026B", "2025A"])).toEqual([
      "2024A",
      "2024C",
      "2025A",
      "2025B",
      "2026A",
      "2026B",
    ]);
  });

  it("de-duplicates repeated keys", () => {
    expect(sortPeriods(["2025B", "2025B", "2025B"])).toEqual(["2025B"]);
  });

  it("spans a run of periods and collapses a single one", () => {
    expect(periodSpan(["2026B", "2024A"])).toBe("2024A–2026B");
    expect(periodSpan(["2025B"])).toBe("2025B");
    expect(periodSpan([])).toBe("—");
  });

  it("does not fail on a key that is not a canonical period", () => {
    // Older processed tables carry plain years (e.g. a 2026 cold-chain table).
    expect(sortPeriods(["2026", "2025B"])).toEqual(["2025B", "2026"]);
  });
});

describe("coverage limitations", () => {
  const MATRIX: CoverageDetailRow[] = [
    ...ALL_PERIODS.map((period) => ({
      dataset: "crop_productivity",
      period,
      coverage_level: "district",
      n_districts: 30,
      n_crops: 17,
    })),
    { dataset: "district_factors", period: "2025B", coverage_level: "district", n_districts: 30 },
    { dataset: "erosion_control", period: "2025B", coverage_level: "district", n_districts: 30 },
    { dataset: "national_crop_trends", period: "2024B", coverage_level: "national_crop", n_crops: 21 },
    { dataset: "national_crop_trends", period: "2025B", coverage_level: "national_crop", n_crops: 21 },
  ];

  it("states the real district period span instead of a single season", () => {
    const text = coverageLimitations(MATRIX).join(" ");
    expect(text).toContain("crop_productivity (2024A–2026B)");
    // Regression guard: the page used to hard-code a single-release claim that
    // contradicted the eight periods the pipeline actually published.
    expect(text).not.toContain("only for NISR 2025 Season B");
  });

  it("lists single-release district domains separately", () => {
    const text = coverageLimitations(MATRIX).join(" ");
    expect(text).toContain("2025B only for district_factors, erosion_control");
  });

  it("never describes a dataset that carries district rows as national-only", () => {
    const text = coverageLimitations([
      { dataset: "district_crop_productivity", period: "2025B", coverage_level: "district" },
      { dataset: "district_crop_productivity", period: "2026A", coverage_level: "national" },
    ]).join(" ");
    expect(text).not.toContain("national series only");
  });

  it("calls a dataset with no district rows a national series", () => {
    const text = coverageLimitations([
      { dataset: "national_input_trends", period: "2026A", coverage_level: "national" },
    ]).join(" ");
    expect(text).toContain("national series only");
    expect(text).toContain("national_input_trends");
  });

  it("does not claim a level the pipeline never stated", () => {
    expect(
      coverageLimitations([
        { dataset: "mystery", period: "2026A", coverage_level: "something-new" },
      ]),
    ).toEqual([]);
  });

  it("returns nothing for an empty matrix rather than inventing a claim", () => {
    expect(coverageLimitations([])).toEqual([]);
  });
});
