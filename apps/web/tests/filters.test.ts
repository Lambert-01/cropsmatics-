import { describe, expect, it } from "vitest";

import {
  DEFAULT_BENCHMARK,
  filtersToApiQuery,
  filtersToQuery,
  mergeFilters,
  parseFilters,
  splitPeriod,
} from "@/lib/filters";

describe("parseFilters", () => {
  it("reads every filter from the URL", () => {
    const params = new URLSearchParams(
      "year=2025&season=B&crop=Maize&province=Eastern&district=Ngoma&benchmark=agro_ecological_peer_group",
    );
    expect(parseFilters(params)).toEqual({
      year: 2025,
      season: "B",
      crop: "Maize",
      province: "Eastern",
      district: "Ngoma",
      benchmark: "agro_ecological_peer_group",
    });
  });

  it("defaults the benchmark and omits absent filters", () => {
    const filters = parseFilters(new URLSearchParams(""));
    expect(filters.benchmark).toBe(DEFAULT_BENCHMARK);
    expect(filters.year).toBeUndefined();
    expect(filters.district).toBeUndefined();
  });
});

describe("mergeFilters", () => {
  it("drops cleared values instead of serialising empties", () => {
    const merged = mergeFilters({ crop: "Maize", district: "Ngoma" }, { district: undefined });
    expect(merged).toEqual({ crop: "Maize" });
  });
});

describe("filtersToQuery", () => {
  it("omits the default benchmark to keep URLs short", () => {
    const qs = filtersToQuery({ crop: "Maize", benchmark: DEFAULT_BENCHMARK });
    expect(qs).toBe("crop=Maize");
  });

  it("keeps a non-default benchmark", () => {
    const qs = filtersToQuery({ benchmark: "top_quartile_comparable_districts" });
    expect(qs).toContain("benchmark=top_quartile_comparable_districts");
  });
});

describe("filtersToApiQuery", () => {
  it("always sends the benchmark strategy to the API", () => {
    const qs = filtersToApiQuery({ district: "Ngoma" });
    const params = new URLSearchParams(qs);
    expect(params.get("district")).toBe("Ngoma");
    expect(params.get("benchmark_strategy")).toBe(DEFAULT_BENCHMARK);
  });
});

describe("canonical period handling", () => {
  it("splits a YYYYS period code into its year and season", () => {
    expect(splitPeriod("2026B")).toEqual({ year: 2026, season: "B" });
    expect(splitPeriod("2024C")).toEqual({ year: 2024, season: "C" });
    expect(splitPeriod(undefined)).toEqual({});
    expect(splitPeriod("1990")).toEqual({});
  });

  it("parses the canonical period from the URL", () => {
    expect(parseFilters(new URLSearchParams("period=2026B")).period).toBe("2026B");
  });

  it("sends period_code plus its derived year and season to the API", () => {
    const params = new URLSearchParams(filtersToApiQuery({ period: "2026B", crop: "Maize" }));
    expect(params.get("period_code")).toBe("2026B");
    expect(params.get("year")).toBe("2026");
    expect(params.get("season")).toBe("B");
  });

  it("never emits a contradictory year/season pair alongside a period", () => {
    const params = new URLSearchParams(
      filtersToApiQuery({ period: "2026A", year: 2026, season: "C" }),
    );
    expect(params.get("season")).toBe("A");
    expect(params.get("period_code")).toBe("2026A");
  });

  it("keeps the URL short by writing only the period code when one is set", () => {
    const qs = filtersToQuery({ period: "2026B", year: 2026, season: "B", crop: "Maize" });
    const params = new URLSearchParams(qs);
    expect(params.get("period")).toBe("2026B");
    expect(params.get("year")).toBeNull();
    expect(params.get("season")).toBeNull();
  });

  it("still supports legacy year/season links", () => {
    const params = new URLSearchParams(filtersToApiQuery({ year: 2024, season: "C" }));
    expect(params.get("period_code")).toBeNull();
    expect(params.get("year")).toBe("2024");
    expect(params.get("season")).toBe("C");
  });
});
