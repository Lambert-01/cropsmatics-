import { describe, expect, it } from "vitest";

import {
  DEFAULT_BENCHMARK,
  filtersToApiQuery,
  filtersToQuery,
  mergeFilters,
  parseFilters,
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
