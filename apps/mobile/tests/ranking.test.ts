import { describe, expect, it } from "vitest";

import type { NationalBoardCrop } from "../src/types";
import { rankCropsByLatest } from "../src/utils/ranking";

const PERIODS = ["2024A", "2024B", "2025A", "2025B"];

function crop(name: string, series: Record<string, (number | null)[]>): NationalBoardCrop {
  return {
    crop: name,
    coverage: "district",
    n_published_periods: series.production_mt?.filter((v) => v !== null).length ?? 0,
    latest_published_period: null,
    latest_published_label: null,
    series,
    changes: {},
  };
}

describe("rankCropsByLatest", () => {
  it("ranks by the latest published value, not the last index", () => {
    const ranked = rankCropsByLatest(
      [
        crop("Maize", { production_mt: [10, 20, 30, null] }),
        crop("Beans", { production_mt: [5, 6, 7, 40] }),
      ],
      "production_mt",
      PERIODS,
      5,
    );

    expect(ranked.map((row) => row.crop)).toEqual(["Beans", "Maize"]);
    // Maize's newest value is 2025A, because 2025B was not published for it.
    expect(ranked[1].value).toBe(30);
    expect(ranked[1].period).toBe("2025A");
    expect(ranked[0].period).toBe("2025B");
  });

  it("excludes a crop with nothing published rather than ranking it zero", () => {
    const ranked = rankCropsByLatest(
      [
        crop("Maize", { production_mt: [null, null, null, null] }),
        crop("Beans", { production_mt: [null, null, null, 3] }),
      ],
      "production_mt",
      PERIODS,
      5,
    );

    expect(ranked.map((row) => row.crop)).toEqual(["Beans"]);
  });

  it("keeps a genuine published zero, which is a real observation", () => {
    const ranked = rankCropsByLatest(
      [crop("Other cereals", { production_mt: [null, null, 0, null] })],
      "production_mt",
      PERIODS,
      5,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].value).toBe(0);
    expect(ranked[0].period).toBe("2025A");
  });

  it("honours the limit and is deterministic for equal values", () => {
    const board = [
      crop("A", { production_mt: [1, 1, 1, 5] }),
      crop("B", { production_mt: [1, 1, 1, 5] }),
      crop("C", { production_mt: [1, 1, 1, 9] }),
    ];

    const first = rankCropsByLatest(board, "production_mt", PERIODS, 2);
    const second = rankCropsByLatest(board, "production_mt", PERIODS, 2);

    expect(first.map((row) => row.crop)).toEqual(["C", "A"]);
    expect(second).toEqual(first);
  });

  it("ranks per metric, so the same board can order differently", () => {
    const board = [
      crop("Maize", { production_mt: [100, null, null, 100], yield_mt_ha: [1.2, null, null, 1.2] }),
      crop("Beans", { production_mt: [10, null, null, 10], yield_mt_ha: [3.4, null, null, 3.4] }),
    ];

    expect(rankCropsByLatest(board, "production_mt", PERIODS, 5)[0].crop).toBe("Maize");
    expect(rankCropsByLatest(board, "yield_mt_ha", PERIODS, 5)[0].crop).toBe("Beans");
  });

  it("returns an empty ranking for missing data instead of throwing", () => {
    expect(rankCropsByLatest(undefined, "production_mt", PERIODS, 5)).toEqual([]);
    expect(rankCropsByLatest([], "production_mt", PERIODS, 5)).toEqual([]);
    // A crop object with no series for the metric contributes nothing.
    expect(rankCropsByLatest([crop("Maize", {})], "production_mt", PERIODS, 5)).toEqual([]);
  });
});
