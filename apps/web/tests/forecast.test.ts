import { describe, expect, it } from "vitest";

import { forecastHeadline, policyLine, skillText } from "@/lib/forecast";
import type { ForecastStatusResponse, ForecastTargetDecision } from "@/types";

function target(overrides: Partial<ForecastTargetDecision> = {}): ForecastTargetDecision {
  return {
    target_id: "district_maize_yield_next_season_b",
    status: "insufficient_evidence",
    reasons: ["only 0/30 series support 3 expanding-window folds"],
    n_series: 30,
    n_series_eligible: 0,
    ...overrides,
  };
}

function status(overrides: Partial<ForecastStatusResponse> = {}): ForecastStatusResponse {
  return {
    report_available: true,
    serves_forecast: false,
    generated: "2026-10-12",
    policy: { min_history: 3, min_folds: 3, min_series_coverage: 0.9, interval_level: 0.8 },
    policy_is_default: true,
    method_note: "rolling-origin expanding-window backtest",
    targets: [target()],
    note: "No forecast is served: the chronological backtest judged every candidate target insufficient against its publication policy. This is an evidence verdict about the published record, not a service outage.",
    provenance: {},
    ...overrides,
  };
}

describe("forecastHeadline", () => {
  it("reports a missing report as an absent gate, not an outage", () => {
    const missing = forecastHeadline(undefined);
    expect(missing.tone).toBe("missing");
    expect(missing.title).toMatch(/no validated forecast/i);
    expect(missing.detail).toMatch(/never generated on the fly/i);

    const unavailable = forecastHeadline(status({ report_available: false, targets: [] }));
    expect(unavailable.tone).toBe("missing");
  });

  it("frames a suppressed forecast as an evidence verdict", () => {
    const headline = forecastHeadline(status());
    expect(headline.tone).toBe("suppressed");
    expect(headline.title).toBe("No forecast is published for this dataset");
    expect(headline.detail).toContain("evidence verdict");
    // The eligible-series count comes from the report, never from the client.
    expect(headline.detail).toContain("0/30 series");
  });

  it("counts the targets that passed when a forecast is published", () => {
    const headline = forecastHeadline(
      status({
        serves_forecast: true,
        targets: [
          target({ status: "ok", n_series_eligible: 30, reasons: [] }),
          target({ target_id: "other", status: "insufficient_evidence" }),
        ],
      }),
    );
    expect(headline.tone).toBe("published");
    expect(headline.detail).toContain("1 target passed");
  });
});

describe("policyLine", () => {
  it("renders the gates a reader can check the verdict against", () => {
    expect(policyLine(status())).toBe(
      "min history 3 observations · min folds 3 · series coverage 90% · interval level 80%",
    );
  });

  it("marks a sensitivity run so it can never read as a decision", () => {
    const line = policyLine(status({ policy_is_default: false }));
    expect(line).toContain("sensitivity run");
    expect(line).toContain("not a decision");
  });

  it("stays absent when the report recorded no policy", () => {
    expect(policyLine(status({ policy: {} }))).toBeNull();
    expect(policyLine(undefined)).toBeNull();
  });
});

describe("skillText", () => {
  it("formats skill as a share of the naive baseline", () => {
    expect(skillText(-1.464)).toBe("-146.4%");
    expect(skillText(0.12)).toBe("12.0%");
  });

  it("keeps an absent skill absent rather than reading 0%", () => {
    expect(skillText(null)).toBeNull();
    expect(skillText(undefined)).toBeNull();
    expect(skillText(Number.NaN)).toBeNull();
  });
});
