import { describe, expect, it } from "vitest";

import type { PeriodInfo } from "../src/types";
import {
  datasetsForLayer,
  latestDistrictPeriod,
  layerRequiresCrop,
  linkPeriodToLayer,
  periodsCarryingLayer,
  releaseLabel,
} from "../src/utils/coverage";

/**
 * A catalogue shaped like the one `/meta/periods` returns for this build:
 * crop productivity carries district rows for every published period, while the
 * practice/land tables are still a single 2025 Season B release.
 */
function period(code: string, extra: Partial<PeriodInfo> = {}): PeriodInfo {
  const year = Number(code.slice(0, 4));
  const season = code.slice(4);
  return {
    period_code: code,
    year,
    season,
    label: `${year} Season ${season}`,
    coverage_level: "district",
    n_districts: 30,
    n_crops: season === "C" ? 6 : 17,
    datasets: [{ dataset: "crop_productivity", coverage_level: "district", n_districts: 30, n_crops: 17 }],
    is_latest: code === "2026B",
    is_latest_district: code === "2026B",
    ...extra,
  };
}

const SINGLE_RELEASE_DATASETS = [
  { dataset: "district_factors", coverage_level: "district", n_districts: 30, n_crops: 0 },
  { dataset: "irrigation_water", coverage_level: "district", n_districts: 30, n_crops: 0 },
  { dataset: "erosion_control", coverage_level: "district", n_districts: 30, n_crops: 0 },
];

const CATALOGUE: PeriodInfo[] = [
  period("2024A"),
  period("2024B"),
  period("2024C"),
  period("2025A"),
  period("2025B", { datasets: [...period("2025B").datasets!, ...SINGLE_RELEASE_DATASETS] }),
  period("2025C"),
  period("2026A"),
  period("2026B"),
];

describe("layer availability", () => {
  it("offers productivity-derived layers for every published district period", () => {
    for (const layer of ["yield", "gap", "priority"] as const) {
      const allowed = periodsCarryingLayer(CATALOGUE, layer);
      expect(allowed.map((item) => item.period_code)).toEqual([
        "2024A",
        "2024B",
        "2024C",
        "2025A",
        "2025B",
        "2025C",
        "2026A",
        "2026B",
      ]);
    }
  });

  it("offers single-release adoption layers only for the release that carries them", () => {
    for (const layer of ["input_adoption", "irrigation", "erosion"] as const) {
      const allowed = periodsCarryingLayer(CATALOGUE, layer);
      expect(allowed.map((item) => item.period_code)).toEqual(["2025B"]);
    }
  });

  it("offers nothing rather than guessing when a period list is missing", () => {
    const withoutDatasets = CATALOGUE.map((item) => ({ ...item, datasets: [] }));
    expect(periodsCarryingLayer(withoutDatasets, "input_adoption")).toEqual([]);
    // Productivity layers still work, because they are judged on the coverage
    // level the catalogue states.
    expect(periodsCarryingLayer(withoutDatasets, "gap")).toHaveLength(8);
  });

  it("requires a crop only where the value is a raw yield", () => {
    expect(layerRequiresCrop("yield")).toBe(true);
    expect(layerRequiresCrop("gap")).toBe(false);
    expect(layerRequiresCrop("input_adoption")).toBe(false);
  });

  it("names the dataset behind each layer", () => {
    expect(datasetsForLayer("input_adoption")).toEqual(["district_factors"]);
    expect(datasetsForLayer("gap")).toContain("crop_productivity");
  });
});

describe("linking a chart period to a map layer", () => {
  it("follows the chart when the layer genuinely covers that period", () => {
    const decision = linkPeriodToLayer(CATALOGUE, "gap", "2026B");
    expect(decision.periodCode).toBe("2026B");
    expect(decision.reason).toBeNull();
  });

  it("refuses to follow a national chart into a period the layer does not cover", () => {
    const decision = linkPeriodToLayer(CATALOGUE, "input_adoption", "2026B");
    expect(decision.periodCode).toBe("2025B");
    expect(decision.reason).toContain("2026 Season B");
    expect(decision.reason).toContain("2025 Season B");
  });

  it("explains itself instead of colouring when no period carries the layer", () => {
    const decision = linkPeriodToLayer([], "irrigation", "2025B");
    expect(decision.periodCode).toBeNull();
    expect(decision.reason).toBeTruthy();
  });

  it("asks the API for the latest release when no chart period is selected", () => {
    expect(linkPeriodToLayer(CATALOGUE, "gap", null)).toEqual({
      periodCode: null,
      reason: null,
      reasonCode: null,
      reasonPeriods: { requested: null, fallback: null },
    });
  });
});

describe("period labels and release identifiers", () => {
  it("finds the newest published district period", () => {
    expect(latestDistrictPeriod(CATALOGUE)?.period_code).toBe("2026B");
    expect(latestDistrictPeriod([])).toBeNull();
  });

  it("turns a single-release identifier into the published period label", () => {
    expect(releaseLabel("2025-B", CATALOGUE)).toBe("2025 Season B");
    expect(releaseLabel("2025B", CATALOGUE)).toBe("2025 Season B");
  });

  it("shows an unknown release unchanged instead of inventing a label", () => {
    expect(releaseLabel("2019-C", CATALOGUE)).toBe("2019-C");
    expect(releaseLabel(null, CATALOGUE)).toBeNull();
  });
});
