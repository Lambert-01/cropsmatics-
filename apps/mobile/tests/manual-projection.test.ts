import { describe, expect, it, vi } from "vitest";

import { buildManualProjectionPayload } from "../src/services/api/projection";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));

describe("manual planning payloads", () => {
  it("keeps a carry-forward request free of change assumptions", () => {
    expect(
      buildManualProjectionPayload({
        crop: "Maize",
        geography: "national",
        season: "B",
        originPeriod: "2025B",
        horizonSteps: 1,
        metric: "yield_kg_ha",
        method: "carry_forward",
        changePct: 12,
      }),
    ).not.toHaveProperty("change_pct");
  });

  it("sends district scope only when the user selected a district", () => {
    const payload = buildManualProjectionPayload({
      crop: "Beans",
      geography: "district",
      district: "Ngoma",
      season: "A",
      horizonSteps: 2,
      metric: "production_mt",
      method: "percent_change",
      changePct: 5,
    });
    expect(payload.district).toBe("Ngoma");
    expect(payload.change_pct).toBe(5);
    expect(payload.horizon_steps).toBe(2);
  });

  it("keeps personal assumptions explicit and server-bound", () => {
    const payload = buildManualProjectionPayload({
      crop: "Potatoes",
      geography: "national",
      season: "C",
      horizonSteps: 3,
      metric: "production_mt",
      method: "personal",
      assumedYield: 1800,
      assumedArea: 2.5,
    });
    expect(payload.assumed_yield_kg_ha).toBe(1800);
    expect(payload.assumed_harvested_area_ha).toBe(2.5);
    expect(payload).not.toHaveProperty("change_pct");
  });
});
