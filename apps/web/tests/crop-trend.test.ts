import { describe, expect, it } from "vitest";

import { mergeTrendSeries, publishedTrendCount, yieldOverlayPoints } from "@/features/crops/trend";
import type { PeriodTrendResponse } from "@/types";

function resp(
  district: string | null,
  points: { code: string; label: string; yield?: number | null; production?: number | null }[],
): PeriodTrendResponse {
  return {
    crop: "Maize",
    district,
    geography_scope: district ? "district" : "national",
    unit: { yield_kg_ha: "kg/ha" },
    points: points.map((p) => ({
      period_code: p.code,
      year: Number(p.code.slice(0, 4)),
      season: p.code.slice(4),
      label: p.label,
      values: {
        yield_kg_ha: p.yield ?? null,
        production_mt: p.production ?? null,
        harvested_area_ha: null,
      },
    })),
    available_periods: points.map((p) => p.code),
    provenance: {},
  };
}

describe("mergeTrendSeries", () => {
  it("aligns two series on their period codes, ascending", () => {
    const primary = resp("Bugesera", [
      { code: "2024B", label: "2024 Season B", yield: 2000 },
      { code: "2025B", label: "2025 Season B", yield: 2400 },
    ]);
    const comparison = resp(null, [
      { code: "2024B", label: "2024 Season B", yield: 1800 },
      { code: "2025B", label: "2025 Season B", yield: 2100 },
    ]);
    const merged = mergeTrendSeries(primary, comparison, "yield_kg_ha");
    expect(merged.map((p) => p.period_code)).toEqual(["2024B", "2025B"]);
    expect(merged[0]).toMatchObject({ primary: 2000, comparison: 1800 });
    expect(merged[1]).toMatchObject({ primary: 2400, comparison: 2100 });
  });

  it("keeps a period only one side published, as a one-sided point", () => {
    const primary = resp("Bugesera", [
      { code: "2024A", label: "2024 Season A", yield: 1000 },
      { code: "2025B", label: "2025 Season B", yield: 2400 },
    ]);
    const comparison = resp(null, [{ code: "2025B", label: "2025 Season B", yield: 2100 }]);
    const merged = mergeTrendSeries(primary, comparison, "yield_kg_ha");
    expect(merged.map((p) => p.period_code)).toEqual(["2024A", "2025B"]);
    expect(merged[0]).toMatchObject({ primary: 1000, comparison: null });
  });

  it("does not interpolate a missing value or invent a zero", () => {
    const primary = resp("Bugesera", [{ code: "2025B", label: "2025 Season B", yield: null }]);
    const comparison = resp(null, [{ code: "2025B", label: "2025 Season B", yield: 2100 }]);
    const merged = mergeTrendSeries(primary, comparison, "yield_kg_ha");
    expect(merged[0].primary).toBeNull();
    expect(merged[0].comparison).toBe(2100);
    // A side with no finite value is not counted as published.
    expect(publishedTrendCount(merged)).toBe(1);
  });

  it("treats a missing comparison as a null-filled single series", () => {
    const primary = resp(null, [{ code: "2025B", label: "2025 Season B", yield: 2100 }]);
    const merged = mergeTrendSeries(primary, undefined, "yield_kg_ha");
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ primary: 2100, comparison: null });
  });

  it("reads the requested metric column", () => {
    const primary = resp(null, [{ code: "2025B", label: "2025 Season B", yield: 2100, production: 90000 }]);
    expect(mergeTrendSeries(primary, undefined, "production_mt")[0].primary).toBe(90000);
    expect(mergeTrendSeries(primary, undefined, "harvested_area_ha")[0].primary).toBeNull();
  });

  it("returns an empty list when neither side has points", () => {
    expect(mergeTrendSeries(undefined, undefined, "yield_kg_ha")).toEqual([]);
    expect(publishedTrendCount([])).toBe(0);
  });
});

describe("yieldOverlayPoints", () => {
  it("restricts both sides to the selected season", () => {
    const primary = resp("Bugesera", [
      { code: "2024A", label: "2024 Season A", yield: 1000, production: 100 },
      { code: "2024B", label: "2024 Season B", yield: 2000, production: 200 },
      { code: "2025B", label: "2025 Season B", yield: 2400, production: 260 },
    ]);
    const comparison = resp(null, [{ code: "2025B", label: "2025 Season B", yield: 2100 }]);
    const points = yieldOverlayPoints(primary, comparison, { sameSeasonOnly: true, season: "B" });
    expect(points.map((p) => p.period_code)).toEqual(["2024B", "2025B"]);
    expect(points[1]).toMatchObject({ yield_kg_ha: 2400, comparison_yield_kg_ha: 2100 });
  });

  it("keeps production only from the primary series", () => {
    const primary = resp(null, [{ code: "2025B", label: "2025 Season B", yield: 2100, production: 900 }]);
    const comparison = resp("Bugesera", [{ code: "2025B", label: "2025 Season B", yield: 2400 }]);
    const points = yieldOverlayPoints(primary, comparison, {});
    expect(points[0]).toMatchObject({
      yield_kg_ha: 2100,
      comparison_yield_kg_ha: 2400,
      production_mt: 900,
    });
  });

  it("includes every published period when no season is selected", () => {
    const primary = resp(null, [
      { code: "2024A", label: "2024 Season A", yield: 1000 },
      { code: "2024B", label: "2024 Season B", yield: 2000 },
    ]);
    expect(yieldOverlayPoints(primary, undefined, { sameSeasonOnly: true }).map((p) => p.period_code)).toEqual([
      "2024A",
      "2024B",
    ]);
  });

  it("leaves the comparison null when there is no overlay", () => {
    const primary = resp(null, [{ code: "2025B", label: "2025 Season B", yield: 2100 }]);
    expect(yieldOverlayPoints(primary, undefined, {})[0].comparison_yield_kg_ha).toBeNull();
  });
});
