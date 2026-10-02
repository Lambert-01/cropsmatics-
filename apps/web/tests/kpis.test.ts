import { describe, expect, it } from "vitest";

import {
  MAX_PRIMARY_KPIS,
  pickKpisByIds,
  primaryKpisAreConsistent,
  selectPrimaryKpis,
  selectSecondaryKpis,
} from "@/lib/kpis";
import type { KPI } from "@/types";

const kpi = (id: string, extra: Partial<KPI> = {}): KPI => ({
  id,
  label: id,
  value: 1,
  period_code: "2026B",
  scope: "selection",
  ...extra,
});

describe("four primary KPI policy", () => {
  it("never renders more than four headline cards", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((id) => kpi(id));
    expect(selectPrimaryKpis(many)).toHaveLength(MAX_PRIMARY_KPIS);
    expect(selectPrimaryKpis(many).map((k) => k.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("uses the API's explicit primary selection rather than the first four", () => {
    const all = [kpi("total_production"), kpi("crops"), kpi("districts"), kpi("high_gap")];
    // The API deliberately headlines the last four, not the first four.
    const primary = [kpi("avg_yield"), kpi("total_production"), kpi("total_harvested_area"), kpi("median_gap")];
    expect(selectPrimaryKpis(all, primary).map((k) => k.id)).toEqual([
      "avg_yield",
      "total_production",
      "total_harvested_area",
      "median_gap",
    ]);
  });

  it("moves every non-primary metric into the secondary set, without duplicates", () => {
    const all = ["a", "b", "c", "d", "e"].map((id) => kpi(id));
    const primary = [kpi("a"), kpi("b")];
    const secondary = selectSecondaryKpis(all, primary);
    expect(secondary.map((k) => k.id)).toEqual(["c", "d", "e"]);
    expect(secondary.some((k) => k.id === "a")).toBe(false);
  });

  it("drops a secondary metric that the API also lists as primary", () => {
    const all = [kpi("a"), kpi("b"), kpi("c")];
    const primary = [kpi("a")];
    const secondary = [kpi("a"), kpi("b"), kpi("c")];
    expect(selectSecondaryKpis(all, primary, secondary).map((k) => k.id)).toEqual(["b", "c"]);
  });

  it("lets a page name its own headline ids in the order it wants", () => {
    const kpis = [kpi("districts_below"), kpi("yoy_yield"), kpi("mean_yield"), kpi("benchmark_yield")];
    // Yield Intelligence's declared headline set, not response order.
    const primary = pickKpisByIds(kpis, [
      "mean_yield",
      "benchmark_yield",
      "gap_shortfall",
      "yoy_yield",
    ]);
    expect(primary.map((k) => k.id)).toEqual(["mean_yield", "benchmark_yield", "yoy_yield"]);
    // gap_shortfall is absent from the response, so it is skipped rather than
    // replaced by an unrelated metric to fill the slot.
    expect(primary).toHaveLength(3);
  });

  it("caps a page-declared set at four", () => {
    const kpis = ["a", "b", "c", "d", "e"].map((id) => kpi(id));
    expect(pickKpisByIds(kpis, ["a", "b", "c", "d", "e"])).toHaveLength(MAX_PRIMARY_KPIS);
  });

  it("treats a cross-period context figure as inconsistent for the headline row", () => {
    const period = "2026B";
    const clean = [kpi("total_production"), kpi("crops")];
    expect(primaryKpisAreConsistent(clean, period)).toBe(true);

    const mixed = [kpi("total_production"), kpi("input_adoption", { scope: "context", period_code: "2025B" })];
    expect(primaryKpisAreConsistent(mixed, period)).toBe(false);
  });
});
