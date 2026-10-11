import { describe, expect, it } from "vitest";

import {
  coverageLimitations,
  periodSpan,
  periodTimelineState,
  sortPeriods,
  type CoverageDetailRow,
  type PeriodTimelineItem,
} from "@/lib/coverage";

const ALL_PERIODS = ["2024A", "2024B", "2024C", "2025A", "2025B", "2025C", "2026A", "2026B"];

function timelineItem(period_code: string, patch: Partial<PeriodTimelineItem> = {}): PeriodTimelineItem {
  return {
    period_code,
    label: `${period_code.slice(0, 4)} Season ${period_code.slice(4)}`,
    coverage_level: "district",
    n_districts: 30,
    n_crops: 17,
    is_latest: period_code === "2026B",
    is_latest_district: period_code === "2026B",
    ...patch,
  };
}

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

describe("published-period timeline", () => {
  it("marks the selected release as selected, not as a snapshot", () => {
    const cells = periodTimelineState(ALL_PERIODS.map((p) => timelineItem(p)), {
      view: "period",
      selectedPeriod: "2024B",
      snapshotPeriod: "2026B",
    });
    const byCode = Object.fromEntries(cells.map((c) => [c.period_code, c.state]));
    expect(byCode["2024B"]).toBe("selected");
    // With a release selected nothing is a snapshot: the selected release is the
    // scope, and 2026B is just another published release. The API agrees - it
    // returns `snapshot: null` in the period scope.
    expect(byCode["2026B"]).toBe("available");
    expect(cells.some((c) => c.state === "snapshot")).toBe(false);
  });

  it("marks the snapshot release when no release is selected", () => {
    const cells = periodTimelineState(ALL_PERIODS.map((p) => timelineItem(p)), {
      view: "history",
      selectedPeriod: undefined,
      snapshotPeriod: "2026B",
    });
    const byCode = Object.fromEntries(cells.map((c) => [c.period_code, c.state]));
    expect(byCode["2026B"]).toBe("snapshot");
    expect(byCode["2025B"]).toBe("available");
    // Exactly one release is the snapshot: the axis is never ambiguous.
    expect(cells.filter((c) => c.state !== "available")).toHaveLength(1);
  });

  it("describes each release's coverage in plain words", () => {
    const cells = periodTimelineState(
      [
        timelineItem("2026B"),
        timelineItem("2025A", { coverage_level: "national", n_districts: 0 }),
        timelineItem("2024C", { coverage_level: null }),
      ],
      { view: "history" },
    );
    expect(cells[0].coverageText).toBe("30 districts");
    expect(cells[1].coverageText).toBe("national only");
    expect(cells[2].coverageText).toBe("coverage unknown");
  });

  it("marks nothing when there is no scope or snapshot" , () => {
    const cells = periodTimelineState(ALL_PERIODS.map((p) => timelineItem(p)), {});
    expect(cells.every((c) => c.state === "available")).toBe(true);
  });
});
