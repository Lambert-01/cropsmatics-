import { describe, expect, it, vi } from "vitest";

import { projectionApi } from "../src/services/api/projection";

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock("../src/services/api/client", () => ({
  qs: (params: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, value);
    });
    const encoded = query.toString();
    return encoded ? `?${encoded}` : "";
  },
  request: requestMock,
}));

describe("manual planning API contract", () => {
  it("requests origins for the selected scope without hiding the method", async () => {
    requestMock.mockResolvedValueOnce({ origins: [] });

    await projectionApi.origins({
      crop: "Maize",
      season: "B",
      geography: "district",
      district: "Ngoma",
      metric: "yield_kg_ha",
      method: "carry_forward",
    });

    expect(requestMock).toHaveBeenCalledWith(
      "/scenarios/manual-projection/origins?crop=Maize&season=B&district=Ngoma&metric=yield_kg_ha&method=carry_forward",
    );
  });

  it("posts the exact user-controlled scenario to Python", async () => {
    requestMock.mockResolvedValueOnce({ calculation_id: "mp_test" });
    const payload = {
      crop: "Beans",
      geography: "national" as const,
      district: null,
      season: "A",
      origin_period: "2025A",
      horizon_steps: 2,
      metric: "production_mt" as const,
      method: "percent_change" as const,
      baseline: "latest_observed" as const,
      compounding: "once" as const,
      change_pct: 7,
    };

    await projectionApi.calculate(payload);

    expect(requestMock).toHaveBeenCalledWith("/scenarios/manual-projection", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  });
});
