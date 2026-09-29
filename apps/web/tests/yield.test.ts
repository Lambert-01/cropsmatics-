import { describe, expect, it } from "vitest";

import { summarizeDistricts } from "@/lib/yield";
import {
  DEFAULT_YIELD_WORKSPACE,
  YIELD_WORKSPACES,
  resolveWorkspace,
} from "@/lib/yield-workspaces";

function row(overrides: Record<string, string | number | null>) {
  return { district: "Gasabo", ...overrides };
}

describe("summarizeDistricts", () => {
  it("returns empty, not zeroed, statistics when there are no rows", () => {
    const summary = summarizeDistricts([]);
    expect(summary.n).toBe(0);
    expect(summary.nWithYield).toBe(0);
    expect(summary.shareBelowBenchmarkPct).toBeNull();
    expect(summary.highest).toBeNull();
    expect(summary.lowest).toBeNull();
    expect(summary.largestGap).toBeNull();
  });

  it("treats a positive gap index as below benchmark", () => {
    // The API's own top_gaps ranks descending on gap_index, so positive = shortfall.
    const summary = summarizeDistricts([
      row({ district: "A", yield_kg_ha: 1000, gap_index: 12 }),
      row({ district: "B", yield_kg_ha: 900, gap_index: -3 }),
      row({ district: "C", yield_kg_ha: 800, gap_index: 0 }),
    ]);
    expect(summary.nBelowBenchmark).toBe(1);
    expect(summary.nAtOrAboveBenchmark).toBe(2);
  });

  it("computes the share below benchmark over measurable districts", () => {
    const summary = summarizeDistricts([
      row({ district: "A", yield_kg_ha: 1000, gap_index: 10 }),
      row({ district: "B", yield_kg_ha: 900, gap_index: 5 }),
      row({ district: "C", yield_kg_ha: 800, gap_index: -1 }),
      row({ district: "D", yield_kg_ha: 700, gap_index: -9 }),
    ]);
    expect(summary.shareBelowBenchmarkPct).toBe(50);
  });

  it("finds the highest and lowest observed yield", () => {
    const summary = summarizeDistricts([
      row({ district: "A", yield_kg_ha: 1200, gap_index: 1 }),
      row({ district: "B", yield_kg_ha: 2400, gap_index: -4 }),
      row({ district: "C", yield_kg_ha: 800, gap_index: 30 }),
    ]);
    expect(summary.highest).toEqual({ district: "B", value: 2400 });
    expect(summary.lowest).toEqual({ district: "C", value: 800 });
    expect(summary.largestGap).toEqual({ district: "C", value: 30 });
  });

  it("excludes districts with no published yield instead of counting them as zero", () => {
    const summary = summarizeDistricts([
      row({ district: "A", yield_kg_ha: 1000, gap_index: 4 }),
      row({ district: "B", yield_kg_ha: null, gap_index: null }),
    ]);
    expect(summary.n).toBe(2);
    expect(summary.nWithYield).toBe(1);
    expect(summary.lowest).toEqual({ district: "A", value: 1000 });
  });

  it("ignores non-numeric and non-finite values", () => {
    const summary = summarizeDistricts([
      row({ district: "A", yield_kg_ha: "not-a-number", gap_index: Number.NaN }),
      row({ district: "B", yield_kg_ha: 500, gap_index: 2 }),
    ]);
    expect(summary.nWithYield).toBe(1);
    expect(summary.highest).toEqual({ district: "B", value: 500 });
  });

  it("reports no measurable share when no gap could be computed", () => {
    const summary = summarizeDistricts([row({ district: "A", yield_kg_ha: 10, gap_index: null })]);
    expect(summary.shareBelowBenchmarkPct).toBeNull();
    expect(summary.nBelowBenchmark).toBe(0);
    expect(summary.nAtOrAboveBenchmark).toBe(0);
  });
});

describe("yield workspaces", () => {
  it("offers no duplicate ids and no duplicate labels", () => {
    const ids = YIELD_WORKSPACES.map((w) => w.id);
    const labels = YIELD_WORKSPACES.map((w) => w.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("covers the analytical questions the page answers", () => {
    const ids = YIELD_WORKSPACES.map((w) => w.id);
    for (const expected of ["overview", "trends", "spatial", "gaps", "drivers", "scenarios", "ai", "methodology"]) {
      expect(ids).toContain(expected);
    }
  });

  it("describes every workspace so the tab strip is not a bare label", () => {
    for (const workspace of YIELD_WORKSPACES) {
      expect(workspace.description.length).toBeGreaterThan(10);
    }
  });

  it("falls back to the default workspace for a missing or unknown id", () => {
    expect(resolveWorkspace(null)).toBe(DEFAULT_YIELD_WORKSPACE);
    expect(resolveWorkspace(undefined)).toBe(DEFAULT_YIELD_WORKSPACE);
    expect(resolveWorkspace("not-a-workspace")).toBe(DEFAULT_YIELD_WORKSPACE);
    expect(resolveWorkspace("")).toBe(DEFAULT_YIELD_WORKSPACE);
  });

  it("honours a known workspace id", () => {
    expect(resolveWorkspace("spatial")).toBe("spatial");
  });
});
