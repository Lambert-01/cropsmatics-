import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForecastStatusResponse } from "@/types";
import { forecastQuery } from "@/lib/forecast";
import { ForecastPanel } from "@/features/yield-intelligence/ForecastPanel";

const query = vi.hoisted(() => ({
  data: undefined as ForecastStatusResponse | undefined,
  isLoading: false, error: null as Error | null, refetch: vi.fn(),
}));
vi.mock("@/services/hooks/useAnalytics", () => ({ useForecastStatus: () => query }));

const fixture = (): ForecastStatusResponse => ({
  report_available: true, serves_forecast: true, note: "Published", policy: {},
  provenance: {}, targets: [{
    target_id: "district_maize_yield_next_season_b", label: "Maize / Bugesera / Season B",
    status: "ok", point_estimate: 1234.5, interval: [1100, 1400], interval_level: 0.9,
    unit: "kg/ha", next_period: "2027B", reasons: [], n_series: 30, n_series_eligible: 30,
  }],
});
beforeEach(() => { query.data = undefined; query.isLoading = false; query.error = null; });

describe("forecast request scope", () => {
  it("canonical period wins over a contradictory legacy season", () => {
    const q = new URLSearchParams(forecastQuery({ period: "2026B", season: "A", crop: "Maize", district: "Bugesera" }));
    expect(Object.fromEntries(q)).toEqual({ season: "B", crop: "Maize", district: "Bugesera" });
  });
  it("history scope does not inherit a hidden stored season", () => {
    expect(forecastQuery({ view: "history", period: "2025B", season: "B" })).toBe("");
  });
});

describe("rendered forecast panel", () => {
  it("shows recoverable failure rather than a no-target claim", () => {
    query.error = new Error("network failed");
    const html = renderToStaticMarkup(createElement(ForecastPanel));
    expect(html).toContain("Forecast information could not be loaded");
    expect(html).toContain("Retry");
    expect(html).not.toContain("No forecast target");
  });
  it("keeps loading separate from no matching target", () => {
    query.isLoading = true;
    const html = renderToStaticMarkup(createElement(ForecastPanel));
    expect(html).not.toContain("No forecast target");
    expect(html).not.toContain("Forecast outlook");
  });
  it("renders real interval level and scoped label", () => {
    query.data = fixture();
    const html = renderToStaticMarkup(createElement(ForecastPanel));
    expect(html).toContain("Maize / Bugesera / Season B");
    expect(html).toContain("90%");
    expect(html).not.toContain("80%");
    expect(html).toContain("2027B");
  });
  it("never publishes stale point values when the report gate is closed", () => {
    query.data = { ...fixture(), serves_forecast: false };
    const html = renderToStaticMarkup(createElement(ForecastPanel));
    expect(html).not.toContain("1,234.5");
    expect(html).toContain("Withheld");
  });
  it("does not turn missing interval bounds into zero", () => {
    const data = fixture();
    data.targets[0].interval = [null as unknown as number, 1400];
    query.data = data;
    const html = renderToStaticMarkup(createElement(ForecastPanel));
    expect(html).toContain("Interval unavailable");
    expect(html).not.toContain("interval: 0");
  });
  it("preserves the last successful result if refreshing fails", () => {
    query.data = fixture(); query.error = new Error("refresh failed");
    const html = renderToStaticMarkup(createElement(ForecastPanel));
    expect(html).toContain("Showing saved forecast information");
    expect(html).toContain("Maize / Bugesera");
  });
});
