import { describe, expect, it } from "vitest";

import {
  availableSeasons,
  availableYears,
  compatiblePeriod,
  reconcileScope,
  scopeLabel,
} from "../src/utils/periodScope";

// The national board's real published axis: NISR published 2025 A and B, and
// 2026 A and B so far. 2025C is deliberately present to prove the helper reads
// the axis rather than assuming a three-season calendar.
const AXIS = ["2024B", "2025A", "2025B", "2025C", "2026A", "2026B"];

describe("availableYears", () => {
  it("lists published years newest first", () => {
    expect(availableYears(AXIS)).toEqual([2026, 2025, 2024]);
  });

  it("ignores malformed codes and empty input", () => {
    expect(availableYears([])).toEqual([]);
    expect(availableYears(["", "nonsense", "2025B"])).toEqual([2025]);
  });
});

describe("availableSeasons", () => {
  it("returns only the seasons published for that year, in A/B/C order", () => {
    expect(availableSeasons(AXIS, 2025)).toEqual(["A", "B", "C"]);
    expect(availableSeasons(AXIS, 2024)).toEqual(["B"]);
    expect(availableSeasons(AXIS, 2026)).toEqual(["A", "B"]);
  });

  it("returns an empty list for a year the axis does not carry", () => {
    expect(availableSeasons(AXIS, 2001)).toEqual([]);
  });

  it("lists every season across years when no year is selected", () => {
    expect(availableSeasons(AXIS, null)).toEqual(["A", "B", "C"]);
  });
});

describe("reconcileScope", () => {
  it("keeps a year and season that the axis really publishes", () => {
    expect(reconcileScope({ year: 2025, season: "B" }, AXIS)).toEqual({
      year: 2025,
      season: "B",
    });
  });

  it("clears a season the selected year did not publish", () => {
    // 2024 published Season B only, so asking for 2024C must not survive.
    expect(reconcileScope({ year: 2024, season: "C" }, AXIS)).toEqual({
      year: 2024,
      season: null,
    });
  });

  it("clears a year the axis does not carry, and its season with it", () => {
    expect(reconcileScope({ year: 2001, season: "A" }, AXIS)).toEqual({
      year: null,
      season: null,
    });
  });

  it("keeps a year-only scope, which the API resolves to its published seasons", () => {
    expect(reconcileScope({ year: 2025, season: null }, AXIS)).toEqual({
      year: 2025,
      season: null,
    });
  });

  it("degrades to an unscoped selector when the axis is empty", () => {
    expect(reconcileScope({ year: 2025, season: "A" }, [])).toEqual({
      year: null,
      season: null,
    });
  });
});

describe("compatiblePeriod", () => {
  // The map publishes several periods; the district comparison publishes its own
  // subset. A link from one to the other must not force an unsupported period.
  const PUBLISHED = ["2025B", "2026A", "2026B"];

  it("accepts a period this view really publishes", () => {
    expect(compatiblePeriod("2026A", PUBLISHED)).toBe("2026A");
  });

  it("drops a period this view does not publish", () => {
    expect(compatiblePeriod("2024A", PUBLISHED)).toBeNull();
    expect(compatiblePeriod("2026C", PUBLISHED)).toBeNull();
  });

  it("treats a missing or blank request as no request", () => {
    expect(compatiblePeriod(null, PUBLISHED)).toBeNull();
    expect(compatiblePeriod(undefined, PUBLISHED)).toBeNull();
    expect(compatiblePeriod("   ", PUBLISHED)).toBeNull();
  });

  it("normalises case and whitespace before matching", () => {
    expect(compatiblePeriod(" 2026a ", PUBLISHED)).toBe("2026A");
  });

  it("returns null when nothing is published at all", () => {
    expect(compatiblePeriod("2026A", [])).toBeNull();
  });
});

describe("scopeLabel", () => {
  it("names the calendar a card belongs to", () => {
    expect(scopeLabel({ year: null, season: null })).toBe("");
    expect(scopeLabel({ year: 2025, season: null })).toBe("2025");
    expect(scopeLabel({ year: 2025, season: "B" })).toBe("2025 Season B");
  });
});
