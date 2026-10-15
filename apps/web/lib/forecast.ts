/**
 * Forecast presentation helpers.
 *
 * The forecast workspace exists to answer one question honestly: *may this
 * platform serve a next-season forecast for the current data?* The answer is
 * the backtest's, never the client's — these functions only turn the report
 * into words, so the UI cannot disagree with the gate about its own verdict.
 *
 * Pure and synchronous so the three states a reader can meet (published,
 * suppressed for evidence, report absent) are testable without a renderer.
 */

import type { ForecastStatusResponse } from "@/types";
import { splitPeriod, type DashboardFilters } from "./filters";

/** Only send dimensions that the forecast status endpoint actually supports. */
export function forecastQuery(filters: DashboardFilters = {}): string {
  const query = new URLSearchParams();
  const season = filters.view === "history" ? undefined : splitPeriod(filters.period).season ?? filters.season;
  if (season) query.set("season", season);
  if (filters.crop) query.set("crop", filters.crop);
  if (filters.district) query.set("district", filters.district);
  if (filters.province) query.set("province", filters.province);
  return query.toString();
}

export type ForecastTone = "published" | "suppressed" | "missing";

export interface ForecastHeadline {
  tone: ForecastTone;
  title: string;
  detail: string;
}

/**
 * The one-line verdict for the workspace.
 *
 * A suppressed forecast is framed as an evidence verdict about the published
 * record — not as an outage and not as "coming soon". That distinction is the
 * whole point of the workspace: an honest inability to forecast is a valid,
 * complete answer.
 */
export function forecastHeadline(status: ForecastStatusResponse | undefined): ForecastHeadline {
  if (!status || !status.report_available) {
    return {
      tone: "missing",
      title: "No validated forecast in this deployment",
      detail:
        "The chronological backtest report is not present, so no forecast can be served. Forecasting is published only from a default-policy backtest — never generated on the fly.",
    };
  }
  if (status.serves_forecast) {
    const passing = status.targets.filter((target) => target.status === "ok").length;
    return {
      tone: "published",
      title: "A validated forecast is published",
      detail:
        passing > 0
          ? `${passing} target${passing === 1 ? "" : "s"} passed every publication gate in the backtest of ${status.generated ?? "the latest run"}.`
          : (status.note ?? ""),
    };
  }
  if (status.targets.length === 0) {
    return {
      tone: "suppressed",
      title: "No forecast target covers this selection",
      detail: status.note ?? "",
    };
  }
  const eligible = Math.max(0, ...status.targets.map((target) => target.n_series_eligible));
  const total = Math.max(0, ...status.targets.map((target) => target.n_series));
  return {
    tone: "suppressed",
    title: "No forecast is published for this selection",
    detail: `${status.note ?? ""} (${eligible}/${total} series cleared the history gate.)`,
  };
}

/** One human line for the publication policy the backtest was judged under. */
export function policyLine(status: ForecastStatusResponse | undefined): string | null {
  const policy = status?.policy;
  if (!policy || Object.keys(policy).length === 0) return null;
  const parts: string[] = [];
  if (typeof policy.min_history === "number") {
    parts.push(`min history ${policy.min_history} observations`);
  }
  if (typeof policy.min_folds === "number") {
    parts.push(`min folds ${policy.min_folds}`);
  }
  if (typeof policy.min_series_coverage === "number") {
    parts.push(`series coverage ${Math.round(policy.min_series_coverage * 100)}%`);
  }
  if (typeof policy.interval_level === "number") {
    parts.push(`interval level ${Math.round(policy.interval_level * 100)}%`);
  }
  if (parts.length === 0) return null;
  const suffix = status?.policy_is_default === false ? " (sensitivity run — not a decision)" : "";
  return parts.join(" · ") + suffix;
}

/** Skill is a share; absent skill stays absent rather than reading 0 %. */
export function skillText(skill: number | null | undefined): string | null {
  if (skill === null || skill === undefined || Number.isNaN(skill)) return null;
  return `${(skill * 100).toFixed(1)}%`;
}
