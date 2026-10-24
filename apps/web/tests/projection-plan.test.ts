import { describe, expect, it } from "vitest";

import {
  PLAN_VERSION,
  isStalePlan,
  manualProjectionRequest,
  nextSameSeasonCodes,
  parsePlan,
  serializePlan,
  type ManualProjectionForm,
} from "@/lib/manualProjection";

/**
 * The share/restore round trip of a planning plan, and the two drift guards
 * the workspace leans on: the planning-target preview (must mirror Python's
 * `next_same_season_codes`) and the outdated check (must be exact, not
 * best-effort). A link the build cannot read is refused with a message that
 * says so — never coerced into a different plan.
 */

const BASE: ManualProjectionForm = {
  crop: "Maize",
  district: "Bugesera",
  season: "B",
  method: "percent_change",
  baseline: "latest_observed",
  horizon: 2,
  metric: "yield_kg_ha",
  changePct: 10,
  compounding: "once",
  originPeriod: "2026B",
};

describe("plan share links", () => {
  it("round-trips a full plan through its URL form", () => {
    const plan: ManualProjectionForm = {
      ...BASE,
      cases: [
        { label: "lower", change_pct: 5 },
        { label: "main", change_pct: 10 },
        { label: "higher", change_pct: 15 },
      ],
      windowSize: 4,
    };
    const restored = parsePlan(serializePlan(plan));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.form).toEqual(plan);
  });

  it("rejects an unsupported plan version with the version in the message", () => {
    const link = JSON.stringify({ version: PLAN_VERSION + 1, form: BASE });
    const restored = parsePlan(link);
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(restored.error).toContain(`v${PLAN_VERSION + 1}`);
      expect(restored.error).toContain(`v${PLAN_VERSION}`);
      expect(restored.error).toContain("Nothing was applied");
    }
  });

  it("rejects a link that is not readable JSON at all", () => {
    const restored = parsePlan("not-json{");
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error).toContain("no plan was applied");
  });

  it("rejects a plan missing its crop rather than restoring a partial one", () => {
    const link = JSON.stringify({ version: PLAN_VERSION, form: { ...BASE, crop: "" } });
    const restored = parsePlan(link);
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error).toContain("crop is missing");
  });

  it("rejects an out-of-range horizon instead of clamping it", () => {
    for (const horizon of [0, 4, 2.5, "3"]) {
      const link = JSON.stringify({ version: PLAN_VERSION, form: { ...BASE, horizon } });
      const restored = parsePlan(link);
      expect(restored.ok, `horizon ${String(horizon)} must be refused`).toBe(false);
    }
  });

  it("rejects inverted assumption bands — the same rule Python validates", () => {
    const link = JSON.stringify({
      version: PLAN_VERSION,
      form: {
        ...BASE,
        cases: [
          { label: "lower", change_pct: 20 },
          { label: "main", change_pct: 10 },
        ],
      },
    });
    const restored = parsePlan(link);
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error).toContain('"lower" case is above its "main"');
  });

  it("rejects bands on methods the backend refuses them for", () => {
    for (const method of ["carry_forward", "personal"] as const) {
      const link = JSON.stringify({
        version: PLAN_VERSION,
        form: {
          ...BASE,
          method,
          cases: [
            { label: "lower", change_pct: 5 },
            { label: "main", change_pct: 10 },
          ],
        },
      });
      const restored = parsePlan(link);
      expect(restored.ok, `bands on ${method} must be refused`).toBe(false);
      if (!restored.ok) expect(restored.error).toContain("'Apply a change' method only");
    }
  });

  it("restores a plan without optional fields untouched", () => {
    const minimal: ManualProjectionForm = {
      crop: "Rice",
      season: "A",
      method: "carry_forward",
      baseline: "median_window",
      horizon: 1,
      metric: "production_mt",
    };
    const restored = parsePlan(serializePlan(minimal));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.form).toEqual(minimal);
  });

  it("keeps a partial lower/higher case set without adding a scalar main case", () => {
    const partial: ManualProjectionForm = {
      ...BASE,
      changePct: null,
      cases: [
        { label: "lower", change_pct: -10 },
        { label: "higher", change_pct: 5 },
      ],
    };
    const request = manualProjectionRequest(partial);
    expect(request.change_pct).toBeUndefined();
    expect(request.cases).toEqual(partial.cases);

    const restored = parsePlan(serializePlan(partial));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.form.cases).toEqual(partial.cases);
  });
});

describe("nextSameSeasonCodes — mirror of Python next_same_season_codes", () => {
  it("steps forward one same-season period at a time", () => {
    expect(nextSameSeasonCodes("2026B", 2)).toEqual(["2027B", "2028B"]);
    expect(nextSameSeasonCodes("2025C", 1)).toEqual(["2026C"]);
    expect(nextSameSeasonCodes("2024A", 3)).toEqual(["2025A", "2026A", "2027A"]);
  });

  it("never invents a target from an unusable input", () => {
    expect(nextSameSeasonCodes("", 2)).toEqual([]);
    expect(nextSameSeasonCodes("2026D", 2)).toEqual([]);
    expect(nextSameSeasonCodes("summer 2026", 2)).toEqual([]);
    expect(nextSameSeasonCodes("2026B", 0)).toEqual([]);
    expect(nextSameSeasonCodes("2026B", -1)).toEqual([]);
  });
});

describe("isStalePlan — the outdated-result guard", () => {
  const request = manualProjectionRequest(BASE);

  it("has nothing stale before the first calculation", () => {
    expect(isStalePlan(null, request)).toBe(false);
  });

  it("is not stale while the form still matches the calculated request", () => {
    expect(isStalePlan({ ...request }, request)).toBe(false);
  });

  it("turns stale the moment any input differs from what Python computed", () => {
    expect(isStalePlan(request, { ...request, horizon_steps: 3 })).toBe(true);
    expect(isStalePlan(request, { ...request, change_pct: 12 })).toBe(true);
    expect(
      isStalePlan(request, {
        ...request,
        cases: [
          { label: "lower", change_pct: 5 },
          { label: "main", change_pct: 10 },
          { label: "higher", change_pct: 15 },
        ],
      }),
    ).toBe(true);
  });

  it("sees a restored origin as a change worth re-calculating", () => {
    expect(isStalePlan(request, { ...request, origin_period: "2025B" })).toBe(true);
    const withoutOrigin = manualProjectionRequest({ ...BASE, originPeriod: null });
    expect(isStalePlan(withoutOrigin, { ...request })).toBe(true);
  });
});
