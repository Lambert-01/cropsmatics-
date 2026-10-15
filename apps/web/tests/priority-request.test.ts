import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { DashboardFilters } from "@/lib/filters";
import {
  ENGINE_WEIGHT_KEYS,
  GAP_FOCUSED_WEIGHTS,
  WEIGHT_ORDER,
  buildPriorityScenarioRequest,
  normalizeWeights,
  rebalanceWeights,
  weightsIssue,
  weightsTotal,
} from "@/lib/priority";
import { FALLBACK_PRESETS, presetToWeights } from "@/lib/priority";
import type { PlannerWeights } from "@/types";

/**
 * The same fixture the API test validates against, so the two sides cannot drift:
 * `services/api/tests/test_priority_request_contract.py` requires every accepted
 * `request` to validate and every rejected one to be refused with 422.
 */
const FIXTURE_PATH = fileURLToPath(
  new URL("../../../services/api/tests/fixtures/priority_scenario_contract.json", import.meta.url),
);

interface AcceptedCase {
  name: string;
  inputs: {
    filters: Partial<DashboardFilters>;
    baseline_weights: PlannerWeights;
    scenario_weights: PlannerWeights;
    scenario_period: string;
    top_n: number;
  };
  request: unknown;
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as {
  accepted: AcceptedCase[];
  rejected: { name: string; refusal: string; request: unknown }[];
};

function buildFromFixture(entry: AcceptedCase) {
  return buildPriorityScenarioRequest({
    filters: entry.inputs.filters as DashboardFilters,
    baselineWeights: entry.inputs.baseline_weights,
    scenarioWeights: entry.inputs.scenario_weights,
    scenarioPeriod: entry.inputs.scenario_period,
    topN: entry.inputs.top_n,
  });
}

describe("buildPriorityScenarioRequest — shared contract fixture", () => {
  it("has fixtures to check", () => {
    expect(fixture.accepted.length).toBeGreaterThan(0);
    expect(fixture.rejected.length).toBeGreaterThan(0);
  });

  it.each(fixture.accepted.map((c) => [c.name, c] as const))(
    "reproduces the request the API test validates: %s",
    (_name, testCase) => {
      expect(buildFromFixture(testCase)).toEqual(testCase.request);
    },
  );

  it("never emits an engine weight key on any accepted case", () => {
    for (const testCase of fixture.accepted) {
      const serialized = JSON.stringify(buildFromFixture(testCase));
      for (const engineKey of ENGINE_WEIGHT_KEYS) {
        expect(serialized).not.toContain(`"${engineKey}":`);
      }
    }
  });

  it("submits a total the server accepts, for every accepted case", () => {
    for (const testCase of fixture.accepted) {
      const request = buildFromFixture(testCase);
      for (const side of [request.baseline, request.scenario]) {
        const weights = side.weights as PlannerWeights;
        expect(Math.abs(weightsTotal(weights) - 1)).toBeLessThanOrEqual(0.02);
        // Every public field is present, so a side is complete on its own.
        expect(Object.keys(weights).sort()).toEqual([...WEIGHT_ORDER].sort());
      }
    }
  });
});

describe("rebalanceWeights", () => {
  const start: PlannerWeights = {
    gap: 0.3,
    vulnerability: 0.2,
    affected_scale: 0.2,
    readiness: 0.2,
    cost: 0.1,
  };

  it("keeps the total at exactly 1 for every slider position", () => {
    for (const key of WEIGHT_ORDER) {
      for (let value = 0; value <= 1.0001; value += 0.05) {
        const next = rebalanceWeights(start, key, Number(value.toFixed(2)));
        expect(weightsTotal(next), `${key}=${value.toFixed(2)}`).toBe(1);
        expect(weightsIssue(next)).toBeNull();
      }
    }
  });

  it("is deterministic: the same drag always produces the same weighting", () => {
    const once = rebalanceWeights(start, "gap", 0.45);
    const twice = rebalanceWeights(start, "gap", 0.45);
    expect(once).toEqual(twice);
    // ...and it does not depend on how the slider got there.
    const viaAnotherPath = rebalanceWeights(rebalanceWeights(start, "cost", 0.4), "gap", 0.45);
    expect(viaAnotherPath.gap).toBe(once.gap);
  });

  it("renders the weight that was moved at the value the user asked for", () => {
    expect(rebalanceWeights(start, "readiness", 0.45).readiness).toBe(0.45);
    expect(rebalanceWeights(start, "gap", 0).gap).toBe(0);
    expect(rebalanceWeights(start, "gap", 1).gap).toBe(1);
  });

  it("keeps the shape of the remainder: the largest stays the largest", () => {
    // Readiness is deliberately the largest of the rest, and must remain so.
    const focused: PlannerWeights = {
      gap: 0.2,
      vulnerability: 0.1,
      affected_scale: 0.1,
      readiness: 0.55,
      cost: 0.05,
    };
    const next = rebalanceWeights(focused, "gap", 0.35);
    expect(next.readiness).toBeGreaterThan(next.vulnerability);
    expect(next.readiness).toBeGreaterThan(next.affected_scale);
    expect(next.readiness).toBeGreaterThan(next.cost);
  });

  it("splits equally when every other weight is zero", () => {
    const cornered: PlannerWeights = {
      gap: 1,
      vulnerability: 0,
      affected_scale: 0,
      readiness: 0,
      cost: 0,
    };
    const next = rebalanceWeights(cornered, "gap", 0.5);
    expect(next.vulnerability).toBe(0.125);
    expect(next.affected_scale).toBe(0.125);
    expect(next.readiness).toBe(0.125);
    expect(next.cost).toBe(0.125);
    expect(weightsTotal(next)).toBe(1);
  });

  it("clamps a value outside the slider's own range", () => {
    expect(rebalanceWeights(start, "gap", 1.4).gap).toBe(1);
    expect(rebalanceWeights(start, "gap", -0.3).gap).toBe(0);
  });

  it("never leaves a negative weight behind", () => {
    for (let value = 0; value <= 1.0001; value += 0.05) {
      const next = rebalanceWeights(start, "cost", Number(value.toFixed(2)));
      for (const key of WEIGHT_ORDER) expect(next[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it("applies to every named preset without producing an invalid request", () => {
    // Presets arrive from the API (or the local fallback) and are applied
    // verbatim; each must already be a submittable weighting.
    for (const [name, preset] of Object.entries(FALLBACK_PRESETS)) {
      const weights = presetToWeights(preset as unknown as Record<string, number>);
      expect(weightsIssue(weights), name).toBeNull();
      const next = rebalanceWeights(weights, "vulnerability", 0.5);
      expect(weightsIssue(next), `${name} after a slider move`).toBeNull();
    }
  });
});

describe("weightsIssue", () => {
  it("accepts a valid weighting", () => {
    expect(weightsIssue({ gap: 0.3, vulnerability: 0.2, affected_scale: 0.2, readiness: 0.2, cost: 0.1 }))
      .toBeNull();
  });

  it("names the total and the tolerance, matching the server's wording", () => {
    const message = weightsIssue({
      gap: 0.35,
      vulnerability: 0.2,
      affected_scale: 0.2,
      readiness: 0.2,
      cost: 0.1,
    });
    expect(message).toContain("1.05");
    expect(message).toContain("1.00");
  });

  it("explains an all-zero weighting rather than sending it", () => {
    const message = weightsIssue({
      gap: 0,
      vulnerability: 0,
      affected_scale: 0,
      readiness: 0,
      cost: 0,
    });
    expect(message).toMatch(/zero/i);
  });

  it("explains a negative weight by name", () => {
    expect(
      weightsIssue({ gap: -0.1, vulnerability: 0.4, affected_scale: 0.3, readiness: 0.2, cost: 0.2 }),
    ).toContain("Productivity gap");
  });
});

describe("normalizeWeights", () => {
  it("preserves the ratios a planner chose while restoring the total", () => {
    const normalized = normalizeWeights({
      gap: 0.6,
      vulnerability: 0.4,
      affected_scale: 0.4,
      readiness: 0.4,
      cost: 0.2,
    });
    expect(weightsTotal(normalized)).toBe(1);
    // gap was 1.5x every other 0.4-valued key and 3x cost; that is preserved.
    expect(normalized.gap / normalized.vulnerability).toBeCloseTo(1.5, 3);
    expect(normalized.gap / normalized.cost).toBeCloseTo(3, 3);
  });

  it("falls back to the platform default rather than dividing by zero", () => {
    const normalized = normalizeWeights({
      gap: 0,
      vulnerability: 0,
      affected_scale: 0,
      readiness: 0,
      cost: 0,
    });
    expect(weightsTotal(normalized)).toBe(1);
    expect(normalized).toEqual({ gap: 0.3, vulnerability: 0.2, affected_scale: 0.2, readiness: 0.2, cost: 0.1 });
  });
});

describe("buildPriorityScenarioRequest — guards", () => {
  const filters: DashboardFilters = { period: "2026B", crop: "Maize", benchmark: "national_crop_median" };

  it("falls back to the page period when no scenario period is chosen", () => {
    const request = buildPriorityScenarioRequest({
      filters,
      baselineWeights: { gap: 0.3, vulnerability: 0.2, affected_scale: 0.2, readiness: 0.2, cost: 0.1 },
      scenarioWeights: GAP_FOCUSED_WEIGHTS,
    });
    // Identical periods keep the default comparison a pure re-weighting.
    expect(request.baseline.period_code).toBe("2026B");
    expect(request.scenario.period_code).toBe("2026B");
  });

  it("sends an explicit null rather than an empty string for an unset field", () => {
    const request = buildPriorityScenarioRequest({
      filters: { benchmark: "national_crop_median" },
      baselineWeights: { gap: 0.3, vulnerability: 0.2, affected_scale: 0.2, readiness: 0.2, cost: 0.1 },
      scenarioWeights: GAP_FOCUSED_WEIGHTS,
    });
    expect(request.baseline.crop).toBeNull();
    expect(request.baseline.district).toBeNull();
    expect(request.baseline.province).toBeNull();
    expect(request.baseline.period_code).toBeNull();
  });

  it("keeps the two sides' scopes identical apart from the chosen period", () => {
    const request = buildPriorityScenarioRequest({
      filters,
      baselineWeights: { gap: 0.3, vulnerability: 0.2, affected_scale: 0.2, readiness: 0.2, cost: 0.1 },
      scenarioWeights: GAP_FOCUSED_WEIGHTS,
      scenarioPeriod: "2025B",
    });
    const scope = (side: typeof request.baseline) => ({
      benchmark_strategy: side.benchmark_strategy,
      crop: side.crop,
      district: side.district,
      province: side.province,
      top_n: side.top_n,
    });
    // The candidate universe is what must stay comparable; the weights and the
    // period are the two things a scenario is allowed to change.
    expect(scope(request.scenario)).toEqual(scope(request.baseline));
    expect(request.baseline.period_code).toBe("2026B");
    expect(request.scenario.period_code).toBe("2025B");
    expect(request.baseline.weights).not.toEqual(request.scenario.weights);
  });

  it("omits optional fields rather than sending undefined", () => {
    const request = buildPriorityScenarioRequest({
      filters,
      baselineWeights: { gap: 0.3, vulnerability: 0.2, affected_scale: 0.2, readiness: 0.2, cost: 0.1 },
      scenarioWeights: GAP_FOCUSED_WEIGHTS,
    });
    expect("top_n" in request.baseline).toBe(false);
    expect("min_score" in request.baseline).toBe(false);
  });
});
