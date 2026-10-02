import { describe, expect, it } from "vitest";

import type { NationalBoardCrop, SameSeasonChange } from "../src/types";
import { computeMovers } from "../src/utils/movers";

const METRIC = "production_mt";

/** A board crop whose same-season change is either published or explicitly absent. */
function crop(name: string, changePct: number | null): NationalBoardCrop {
  const change: SameSeasonChange = {
    metric: METRIC,
    unit: "t",
    available: changePct !== null,
    reason: changePct === null ? "previous year not published" : null,
    period_code: "2025B",
    period_label: "2025 Season B",
    previous_period_code: "2024B",
    previous_period_label: "2024 Season B",
    current_value: changePct === null ? null : 100,
    previous_value: changePct === null ? null : 100,
    change_pct: changePct,
    change_abs: changePct,
  };
  return {
    crop: name,
    coverage: "national",
    n_published_periods: 2,
    latest_published_period: "2025B",
    latest_published_label: "2025 Season B",
    series: {},
    changes: { [METRIC]: change },
  };
}

describe("computeMovers", () => {
  it("ranks the strongest rise first and the largest fall first", () => {
    const board = [crop("Maize", 12), crop("Beans", -8), crop("Rice", 3), crop("Potato", -15)];
    const { growing, falling } = computeMovers(board, METRIC, 2);
    expect(growing.map((m) => m.crop)).toEqual(["Maize", "Rice"]);
    expect(falling.map((m) => m.crop)).toEqual(["Potato", "Beans"]);
  });

  it("never turns a missing comparison into a zero-percent move", () => {
    const board = [crop("Maize", 5), crop("Cassava", null)];
    const { growing, falling } = computeMovers(board, METRIC, 3);
    expect(growing.map((m) => m.crop)).toEqual(["Maize"]);
    expect(falling.map((m) => m.crop)).toEqual(["Maize"]);
    expect([...growing, ...falling].some((m) => m.crop === "Cassava")).toBe(false);
  });

  it("respects the limit and returns empty lists for an empty board", () => {
    const board = [crop("A", 1), crop("B", 2), crop("C", 3), crop("D", 4)];
    expect(computeMovers(board, METRIC, 3).growing).toHaveLength(3);
    expect(computeMovers(undefined, METRIC)).toEqual({ growing: [], falling: [] });
  });
});
