import { describe, expect, it } from "vitest";

import {
  DEFAULTS_NONE,
  DEFAULT_BENCHMARK,
  filtersToApiQuery,
  filtersToQuery,
  isHistoryScope,
  mergeFilters,
  parseDefaultsMode,
  parseFilters,
  parseView,
  scopeSummaryText,
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

describe("reset-filter link (view=history&defaults=none)", () => {
  /** The exact URL `useFilters().reset()` writes. */
  const RESET_URL = "view=history&defaults=none";

  it("round-trips through the URL so a reset link stays a reset", () => {
    const parsed = parseFilters(new URLSearchParams(RESET_URL));
    expect(parsed.view).toBe("history");
    expect(parsed.defaults).toBe("none");

    // Writing it back out must preserve the flag, otherwise the reset would be a
    // one-render effect that snapping a filter undoes.
    const rewritten = new URLSearchParams(filtersToQuery(parsed));
    expect(rewritten.get("view")).toBe("history");
    expect(rewritten.get("defaults")).toBe("none");
  });

  it("ignores an unrecognised defaults value", () => {
    expect(parseDefaultsMode("nonsense")).toBeUndefined();
    expect(parseDefaultsMode(null)).toBeUndefined();
    expect(parseDefaultsMode(DEFAULTS_NONE)).toBe(DEFAULTS_NONE);
  });

  it("does not add the flag to ordinary links", () => {
    const params = new URLSearchParams(filtersToQuery({ view: "history", crop: "Maize" }));
    expect(params.get("defaults")).toBeNull();
  });

  it("keeps the flag when a filter is applied after a reset", () => {
    // The user reset, then narrowed to one crop. They still do not want stored
    // defaults re-applied around the crop they just chose.
    const params = new URLSearchParams(filtersToQuery({ view: "history", defaults: "none", crop: "Beans" }));
    expect(params.get("crop")).toBe("Beans");
    expect(params.get("defaults")).toBe("none");
  });
});

describe("explicit all-published-periods scope", () => {
  it("parses view from the URL and ignores anything unrecognised", () => {
    expect(parseFilters(new URLSearchParams("view=history")).view).toBe("history");
    expect(parseFilters(new URLSearchParams("view=period")).view).toBe("period");
    expect(parseView("nonsense")).toBeUndefined();
    expect(parseView(null)).toBeUndefined();
  });

  it("writes view=history into the URL so the scope survives a reload", () => {
    // Without this, a stored default period would re-apply on the next render
    // and the page would come back on a different scope than it was reset to.
    const params = new URLSearchParams(filtersToQuery({ view: "history", crop: "Maize" }));
    expect(params.get("view")).toBe("history");
    expect(params.get("crop")).toBe("Maize");
    expect(params.get("period")).toBeNull();
  });

  it("keeps a period link free of a redundant view parameter", () => {
    const params = new URLSearchParams(filtersToQuery({ view: "period", period: "2026B" }));
    expect(params.get("period")).toBe("2026B");
    expect(params.get("view")).toBeNull();
  });

  it("sends no period at all in the history scope", () => {
    // The API answers "all published periods" with its own history response.
    // Sending a period here would silently turn the view back into one release.
    const params = new URLSearchParams(
      filtersToApiQuery({ view: "history", period: "2025B", year: 2025, season: "B", crop: "Maize" }),
    );
    expect(params.get("period_code")).toBeNull();
    expect(params.get("year")).toBeNull();
    expect(params.get("season")).toBeNull();
    // The dimensions the history view does understand are still sent.
    expect(params.get("crop")).toBe("Maize");
    expect(params.get("benchmark_strategy")).toBe(DEFAULT_BENCHMARK);
  });

  it("still sends the period in the period scope", () => {
    const params = new URLSearchParams(
      filtersToApiQuery({ view: "period", period: "2026B", crop: "Maize" }),
    );
    expect(params.get("period_code")).toBe("2026B");
    expect(params.get("year")).toBe("2026");
    expect(params.get("season")).toBe("B");
  });

  it("recognises the history scope", () => {
    expect(isHistoryScope({ view: "history" })).toBe(true);
    expect(isHistoryScope({ view: "period", period: "2026B" })).toBe(false);
    // A hand-built filter with no resolved scope keeps the legacy behaviour.
    expect(isHistoryScope({ period: "2026B" })).toBe(false);
  });
});

describe("scopeSummaryText", () => {
  it("names the selected release in the period scope", () => {
    expect(scopeSummaryText({ view: "period", periodLabel: "2026 Season B" })).toBe(
      "2026 Season B",
    );
  });

  it("never calls a one-release snapshot the whole published axis", () => {
    // The string that used to read "All periods" while the numbers came from a
    // single release. It now names that release.
    expect(
      scopeSummaryText({ view: "history", snapshotLabel: "2026 Season B" }),
    ).toBe("All published periods · snapshot 2026 Season B");
  });

  it("says all published periods when no snapshot is known", () => {
    expect(scopeSummaryText({ view: "history" })).toBe("All published periods");
  });
});
