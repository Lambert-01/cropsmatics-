import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyticsApi } from "../src/services/api/analytics";
import { mapsApi } from "../src/services/api/maps";

// The API client resolves its base URL from expo-constants; mock it so the
// service modules can be imported in a plain node test environment. Vitest
// hoists this above the imports, so the services see the mocked module.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test/api/v1" } } },
}));

const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

describe("period-aware mobile API calls", () => {
  it("sends period_code (not the ignored `period` name) to the productivity panel", async () => {
    await analyticsApi.productivity({ crop: "Maize", periodCode: "2026B" });
    const url = urls[0];
    // The canonical multi-period endpoint, not the legacy single-release path.
    expect(url).toContain("/productivity?");
    expect(url).not.toContain("/analytics/productivity");
    expect(url).toContain("period_code=2026B");
    expect(url).not.toMatch(/[?&]period=/);
    expect(url).toContain("crop=Maize");
  });

  it("omits the period filter entirely when none is selected", async () => {
    await analyticsApi.productivity({ crop: "Maize" });
    expect(urls[0]).not.toContain("period_code");
    expect(urls[0]).not.toMatch(/[?&]period=/);
  });

  it("sends period_code to the district map metrics endpoint", async () => {
    await mapsApi.districtMetrics({ metric: "gap", periodCode: "2024C" });
    expect(urls[0]).toContain("/maps/district-metrics?");
    expect(urls[0]).toContain("period_code=2024C");
    expect(urls[0]).not.toMatch(/[?&]period=/);
    expect(urls[0]).toContain("metric=gap");
  });
});
