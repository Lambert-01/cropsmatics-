import { describe, expect, it } from "vitest";

import {
  alignIndexedSeries,
  alignToPeriodAxis,
  indexByPeriod,
  unionPeriods,
  type PeriodKeyedSeries,
} from "../src/utils/analytics";

describe("alignToPeriodAxis", () => {
  it("places every series on one ordered axis with nulls where a period is absent", () => {
    const series: PeriodKeyedSeries[] = [
      { key: "Maize", label: "Maize", valuesByPeriod: { "2023A": 1, "2023B": 2, "2024A": 3 } },
      { key: "Rice", label: "Rice", valuesByPeriod: { "2023B": 20, "2024A": 30 } },
    ];
    const aligned = alignToPeriodAxis(series, ["2023A", "2023B", "2024A"]);
    expect(aligned[0].points.map((p) => p.value)).toEqual([1, 2, 3]);
    // Rice has no 2023A observation: that is a gap, not a zero.
    expect(aligned[1].points.map((p) => p.value)).toEqual([null, 20, 30]);
    expect(aligned[1].points.map((p) => p.label)).toEqual(["2023A", "2023B", "2024A"]);
  });

  it("orders the axis by period code, never by arrival order", () => {
    const series = [{ key: "a", label: "a", valuesByPeriod: { "2024A": 3, "2023A": 1 } }];
    const aligned = alignToPeriodAxis(series, ["2024A", "2023A"]);
    expect(aligned[0].points.map((p) => p.label)).toEqual(["2023A", "2024A"]);
  });
});

describe("alignIndexedSeries", () => {
  it("keeps each crop's own observation under its own period", () => {
    const response = [
      { crop: "Maize", points: [{ period: "2024A", index: 100 }, { period: "2024B", index: 110 }] },
      { crop: "Rice", points: [{ period: "2024B", index: 90 }] },
    ];
    const aligned = alignIndexedSeries(response, ["2024A", "2024B"]);
    const maize = aligned.find((s) => s.key === "Maize")!;
    const rice = aligned.find((s) => s.key === "Rice")!;
    expect(maize.points.map((p) => p.value)).toEqual([100, 110]);
    expect(rice.points.map((p) => p.value)).toEqual([null, 90]);
  });

  it("falls back to the union axis when the response axis misses a point", () => {
    const response = [
      { crop: "Maize", points: [{ period: "2024A", index: 100 }] },
      { crop: "Rice", points: [{ period: "2025B", index: 80 }] },
    ];
    // The server-supplied axis omits 2025B, which a series actually published.
    const aligned = alignIndexedSeries(response, ["2024A"]);
    const rice = aligned.find((s) => s.key === "Rice")!;
    expect(rice.points.map((p) => p.label)).toContain("2025B");
    expect(rice.points.map((p) => p.value)).toEqual([null, 80]);
  });
});

describe("axis helpers", () => {
  it("indexByPeriod keys values by period code", () => {
    expect(indexByPeriod([{ period: "2023A", value: 4 }])).toEqual({ "2023A": 4 });
  });

  it("unionPeriods returns a de-duplicated chronological axis", () => {
    expect(
      unionPeriods([{ period: "2024B" }, { period: "2023A" }, { period: "2024B" }]),
    ).toEqual(["2023A", "2024B"]);
  });
});
