import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { manualProjectionRequest, type ManualProjectionForm } from "@/lib/manualProjection";

/**
 * The same fixture the API test validates against:
 * `services/api/tests/test_manual_projection_contract.py` posts every accepted
 * request and refuses every rejected one. Here we prove the request builder the
 * form uses produces exactly those requests, so the two sides cannot drift.
 */
const FIXTURE_PATH = fileURLToPath(
  new URL("../../../services/api/tests/fixtures/manual_projection_contract.json", import.meta.url),
);

interface AcceptedCase {
  name: string;
  inputs: ManualProjectionForm;
  request: unknown;
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as {
  accepted: AcceptedCase[];
  rejected: { name: string; request: Record<string, unknown>; refusal: string }[];
};

describe("manualProjectionRequest — shared contract fixture", () => {
  it("has fixtures to check", () => {
    expect(fixture.accepted.length).toBeGreaterThan(0);
    expect(fixture.rejected.length).toBeGreaterThan(0);
  });

  it.each(fixture.accepted.map((c) => [c.name, c] as const))(
    "reproduces the request the API test validates: %s",
    (_name, testCase) => {
      expect(manualProjectionRequest(testCase.inputs)).toEqual(testCase.request);
    },
  );

  it("always states a geography and never invents a district", () => {
    for (const testCase of fixture.accepted) {
      const request = manualProjectionRequest(testCase.inputs);
      expect(request.geography).toBe(testCase.inputs.district ? "district" : "national");
      expect(request.district ?? null).toBe(testCase.inputs.district ?? null);
    }
  });

  it("drops assumptions a method does not use", () => {
    // A carry-forward request must not carry a change assumption: the backend
    // refuses it, and the builder must not produce it.
    const request = manualProjectionRequest({
      crop: "Maize",
      district: "Bugesera",
      season: "B",
      method: "carry_forward",
      baseline: "latest_observed",
      horizon: 1,
      metric: "yield_kg_ha",
      changePct: 10,
    });
    expect("change_pct" in request).toBe(false);
    expect("baseline_window" in request).toBe(false);
  });

  it("forces a personal plan onto production, matching the server's rule", () => {
    const request = manualProjectionRequest({
      crop: "Maize",
      district: "Bugesera",
      season: "B",
      method: "personal",
      baseline: "latest_observed",
      horizon: 1,
      metric: "yield_kg_ha",
      assumedYield: 1500,
      assumedArea: 2,
    });
    expect(request.metric).toBe("production_mt");
    expect(request.assumed_yield_kg_ha).toBe(1500);
    expect(request.assumed_harvested_area_ha).toBe(2);
  });

  it("never emits engine-keyed vocabulary on any accepted case", () => {
    for (const testCase of fixture.accepted) {
      const serialized = JSON.stringify(manualProjectionRequest(testCase.inputs));
      for (const engineKey of ["wg", "wv", "wf", "wr", "wc"]) {
        expect(serialized).not.toContain(`"${engineKey}":`);
      }
    }
  });
});
