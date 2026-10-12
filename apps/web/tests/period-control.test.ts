import { describe, expect, it } from "vitest";

import type { PeriodTimelineItem } from "@/lib/coverage";
import {
  axisCoverageNote,
  periodCodeFor,
  publishedRangeSummary,
  publishedYears,
  seasonsForYear,
} from "@/lib/periodControl";

function item(period_code: string, patch: Partial<PeriodTimelineItem> = {}): PeriodTimelineItem {
  const year = period_code.slice(0, 4);
  const season = period_code.slice(4);
  return {
    period_code,
    label: `${year} Season ${season}`,
    coverage_level: "district",
    n_districts: 30,
    n_crops: 17,
    is_latest: period_code === "2026B",
    is_latest_district: period_code === "2026B",
    ...patch,
  };
}

/** The real published axis: 2022A-2026B, with Season C only in some years. */
const AXIS = [
  "2022A",
  "2022B",
  "2022C",
  "2023A",
  "2023B",
  "2023C",
  "2024A",
  "2024B",
  "2024C",
  "2025A",
  "2025B",
  "2025C",
  "2026A",
  "2026B",
].map((code) => item(code));

describe("publishedYears", () => {
  it("lists every published year, newest first", () => {
    expect(publishedYears(AXIS)).toEqual(["2026", "2025", "2024", "2023", "2022"]);
  });

  it("does not invent a year that was never published", () => {
    expect(publishedYears([item("2025B"), item("2026A")])).toEqual(["2026", "2025"]);
  });

  it("ignores a key that is not a canonical period", () => {
    expect(publishedYears([{ period_code: "2026", label: "2026" }])).toEqual([]);
  });
});

describe("seasonsForYear", () => {
  it("returns the seasons that year really published, in order", () => {
    expect(seasonsForYear(AXIS, "2022")).toEqual(["A", "B", "C"]);
    // A year selection can therefore never ask for a season that does not exist.
    expect(seasonsForYear(AXIS, "2026")).toEqual(["A", "B"]);
  });

  it("accepts a number as well as a string", () => {
    expect(seasonsForYear(AXIS, 2024)).toEqual(["A", "B", "C"]);
  });

  it("offers nothing until a year is chosen", () => {
    expect(seasonsForYear(AXIS, undefined)).toEqual([]);
    expect(seasonsForYear(AXIS, "")).toEqual([]);
  });
});

describe("periodCodeFor", () => {
  it("builds the canonical code from a year and a season", () => {
    expect(periodCodeFor("2026", "B")).toBe("2026B");
    expect(periodCodeFor(2024, "c")).toBe("2024C");
  });

  it("is undefined until both halves are known", () => {
    expect(periodCodeFor(undefined, "B")).toBeUndefined();
    expect(periodCodeFor("2026", undefined)).toBeUndefined();
    expect(periodCodeFor("2026", "")).toBeUndefined();
  });
});

describe("publishedRangeSummary", () => {
  it("states the range and the latest release from the data", () => {
    const text = publishedRangeSummary(AXIS);
    expect(text).toContain("Historical data: 2022–2026");
    expect(text).toContain("Latest published season: 2026 Season B");
    expect(text).toContain("14 releases");
  });

  it("never hard-codes the latest release", () => {
    // The supporting line follows the axis. If a new season ships, the line says
    // so without a code change - which is what "do not assume 2026B" means.
    const forward = [
      item("2026B", { is_latest: false, is_latest_district: false }),
      item("2026C", { is_latest: true, is_latest_district: true }),
    ];
    expect(publishedRangeSummary(forward)).toContain("Latest published season: 2026 Season C");
  });

  it("takes the latest from the axis order, not from a stale is_latest flag", () => {
    // Prevents a mislabelled flag from naming an older season as the latest.
    const stale = [
      item("2026A"),
      item("2026B", { is_latest: false, is_latest_district: false }),
    ];
    expect(publishedRangeSummary(stale)).toContain("Latest published season: 2026 Season B");
  });

  it("collapses a single-year axis to that year", () => {
    const single = [item("2026A"), item("2026B")];
    expect(publishedRangeSummary(single)).toContain("Historical data: 2026");
  });

  it("says nothing when there is no published axis", () => {
    expect(publishedRangeSummary([])).toBeNull();
  });
});

describe("axisCoverageNote", () => {
  it("names releases that are national only", () => {
    const note = axisCoverageNote([
      item("2026A"),
      item("2026B", { coverage_level: "national", n_districts: 0 }),
    ]);
    expect(note).toContain("1 of 2 releases are national only");
  });

  it("names releases with no recorded level instead of calling them unknown", () => {
    const note = axisCoverageNote([item("2022A", { coverage_level: null })]);
    expect(note).toContain("no coverage recorded");
  });

  it("says nothing when every release is district-level", () => {
    expect(axisCoverageNote([item("2026A"), item("2026B")])).toBeNull();
    expect(axisCoverageNote([])).toBeNull();
  });
});
