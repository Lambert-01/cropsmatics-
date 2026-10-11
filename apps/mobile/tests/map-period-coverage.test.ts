import { describe, expect, it } from "vitest";

import {
  layerRequiresCrop,
  linkPeriodToLayer,
  periodsCarryingLayer,
  releaseLabel,
} from "../src/utils/coverage";
import type { PeriodInfo } from "../src/types";

function period(
  code: string,
  overrides: Partial<PeriodInfo> = {},
): PeriodInfo {
  return {
    period_code: code,
    year: Number(code.slice(0, 4)),
    season: code.slice(4),
    label: code,
    coverage_level: "district",
    n_districts: 30,
    n_crops: 17,
    is_latest: false,
    is_latest_district: false,
    ...overrides,
  };
}

const PERIODS: PeriodInfo[] = [
  period("2024A"),
  period("2024B"),
  period("2025A"),
  period("2025B", {
    datasets: [
      { dataset: "district_factors", coverage_level: "district", n_districts: 30, n_crops: 0 },
    ],
  }),
];

describe("periodsCarryingLayer", () => {
  it("offers every district period to a multi-period layer", () => {
    expect(periodsCarryingLayer(PERIODS, "gap").map((p) => p.period_code)).toEqual([
      "2024A",
      "2024B",
      "2025A",
      "2025B",
    ]);
  });

  it("restricts a single-release layer to the period that carries it", () => {
    expect(periodsCarryingLayer(PERIODS, "input_adoption").map((p) => p.period_code)).toEqual([
      "2025B",
    ]);
  });

  it("treats a national-only period as not carrying a district layer", () => {
    const nationalOnly = [period("2026A", { coverage_level: "national", n_districts: 0 })];
    expect(periodsCarryingLayer(nationalOnly, "yield")).toEqual([]);
  });
});

describe("linkPeriodToLayer", () => {
  it("follows the chart period when the layer covers it", () => {
    expect(linkPeriodToLayer(PERIODS, "gap", "2024B")).toEqual({
      periodCode: "2024B",
      reason: null,
      reasonCode: null,
      reasonPeriods: { requested: "2024B", fallback: null },
    });
  });

  it("stays on a published period and explains why when the layer does not cover it", () => {
    const decision = linkPeriodToLayer(PERIODS, "input_adoption", "2024A");
    expect(decision.periodCode).toBe("2025B");
    expect(decision.reason).toContain("not published at district level");
    expect(decision.reasonCode).toBe("not-district");
    expect(decision.reasonPeriods).toEqual({ requested: "2024A", fallback: "2025B" });
  });

  it("returns to the map's own selection when no chart period is given", () => {
    expect(linkPeriodToLayer(PERIODS, "gap", null)).toEqual({
      periodCode: null,
      reason: null,
      reasonCode: null,
      reasonPeriods: { requested: null, fallback: null },
    });
  });

  it("says so when no period carries the layer at all", () => {
    const decision = linkPeriodToLayer([period("2024A")], "input_adoption", "2024A");
    expect(decision.periodCode).toBeNull();
    expect(decision.reason).toMatch(/No published period carries this layer/);
    expect(decision.reasonCode).toBe("no-period");
  });
});

describe("layerRequiresCrop", () => {
  it("only the raw yield layer needs a crop", () => {
    expect(layerRequiresCrop("yield")).toBe(true);
    expect(layerRequiresCrop("gap")).toBe(false);
  });
});

describe("releaseLabel", () => {
  it("normalises a YYYY-S release id to the catalogue label", () => {
    expect(releaseLabel("2025-B", [{ ...period("2025B"), label: "2025 Season B" }])).toBe(
      "2025 Season B",
    );
  });

  it("passes an unknown release through unchanged", () => {
    expect(releaseLabel("2099-X", PERIODS)).toBe("2099-X");
  });

  it("returns null for a missing release", () => {
    expect(releaseLabel(null, PERIODS)).toBeNull();
  });
});
