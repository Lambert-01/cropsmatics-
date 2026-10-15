import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ForecastStatusResponse } from "../src/types";
import { PredictionsSection } from "../src/components/analytics/PredictionsSection";

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("../src/store/useAppStore", () => ({ useAppStore: () => "en" }));
vi.mock("../src/theme/theme-context", () => ({
  useTheme: () => ({ typography: {}, colors: {} }),
  useThemedStyles: () => ({}),
}));
vi.mock("../src/components/ui", () => ({
  Card: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
  SectionHeader: ({ title }: { title: string }) => createElement("h2", null, title),
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) =>
    createElement("div", null, message, onRetry ? createElement("button", null, "Retry") : null),
  LoadingSkeleton: () => createElement("div", null, "Loading"),
  OfflineBanner: ({ text }: { text: string }) => createElement("div", null, text),
  SecondaryButton: ({ label }: { label: string }) => createElement("button", null, label),
}));

function fixture(): ForecastStatusResponse {
  return { report_available: true, serves_forecast: true, generated: null, note: "Published",
    provenance: {}, targets: [{
      target_id: "test", label: "Maize / Bugesera", status: "ok", reasons: [],
      point_estimate: 1234.5, interval: [1100, 1400], interval_level: 0.9,
      next_period: "2027B", unit: "kg/ha",
    }],
  };
}
function render(extra: Record<string, unknown> = {}) {
  const element = createElement(PredictionsSection, {
    status: fixture(), isLoading: false, ...extra,
  });
  // The shared SSR renderer's declarations use React 18; native uses React 19.
  return renderToStaticMarkup(element as unknown as Parameters<typeof renderToStaticMarkup>[0]);
}
describe("mobile forecast rendering", () => {
  it("shows a retryable error instead of silently disappearing", () => {
    const html = render({ status: undefined, error: true, onRetry: () => {} });
    expect(html).toContain("Retry");
    expect(html).toContain("Forecasts");
  });
  it("distinguishes offline from an absent report", () => {
    const html = render({ status: undefined, isLoading: true, isOffline: true });
    expect(html).toContain("Offline");
    expect(html).not.toContain("No backtest report");
  });
  it("labels cached data when offline", () => {
    expect(render({ isOffline: true })).toContain("Showing cached information");
  });
  it("uses backend interval level and a human-readable scoped label", () => {
    const html = render();
    expect(html).toContain("90%");
    expect(html).not.toContain("80%");
    expect(html).toContain("Maize / Bugesera");
    expect(html).toContain("2027B");
  });
  it("never substitutes zero for a missing bound", () => {
    const status = fixture();
    status.targets[0].interval = [null as unknown as number, 1400];
    expect(render({ status })).not.toContain("interval");
  });
  it("suppresses stale values when publication is blocked", () => {
    expect(render({ status: { ...fixture(), serves_forecast: false } })).not.toContain("1234.5");
  });
});
