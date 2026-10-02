/**
 * Presentation helpers for the Intervention Priority workspaces.
 *
 * Formatting and key translation only — the browser never ranks, scores, weights
 * or re-weights a candidate. Every number these workspaces show comes from the
 * API, so this module cannot disagree with the engine. It exists so the planner
 * can keep thinking in *its own* weight names while the API stays engine-keyed.
 */

import { fmtNumber } from "@/lib/format";
import type { PlannerWeights } from "@/types";

/** The engine's internal weight keys, in the order the planner presents them. */
export const ENGINE_WEIGHT_KEYS = ["wg", "wv", "wf", "wr", "wc"] as const;

/**
 * The planner's weight names -> the engine's keys. Mirrors the API contract in
 * `app/schemas/analytics.py`; the server validates every value regardless, so a
 * mismatch here can never make an unsupported weighting work.
 */
export const USER_TO_ENGINE: Record<keyof PlannerWeights, string> = {
  gap: "wg",
  vulnerability: "wv",
  affected_scale: "wf",
  readiness: "wr",
  cost: "wc",
};

/** The planner's weight names, in the order the engine defines them. */
export const WEIGHT_ORDER: (keyof PlannerWeights)[] = [
  "gap",
  "vulnerability",
  "affected_scale",
  "readiness",
  "cost",
];

/**
 * The platform's default weighting. Used only until the API answers with its own
 * presets; a request built from it is still validated server-side.
 */
export const DEFAULT_PLANNER_WEIGHTS: PlannerWeights = {
  gap: 0.3,
  vulnerability: 0.2,
  affected_scale: 0.2,
  readiness: 0.2,
  cost: 0.1,
};

/**
 * The "productivity gap focused" position, used as the Scenario Lab's default
 * *scenario* side so the first run compares two defensible weightings rather than
 * a weighting with itself. Mirrors the platform preset of the same name.
 */
export const GAP_FOCUSED_WEIGHTS: PlannerWeights = {
  gap: 0.5,
  vulnerability: 0.15,
  affected_scale: 0.15,
  readiness: 0.15,
  cost: 0.05,
};

/**
 * Named planning positions, used only until the API answers with its own
 * (authoritative) list. The server validates every weighting regardless, so a
 * drift here can never make an unsupported weighting work — the worst case is a
 * select option that comes back as a 422.
 */
export const FALLBACK_PRESETS: Record<string, PlannerWeights> = {
  balanced: DEFAULT_PLANNER_WEIGHTS,
  productivity_gap_focused: GAP_FOCUSED_WEIGHTS,
  affected_area_focused: {
    gap: 0.2,
    vulnerability: 0.2,
    affected_scale: 0.45,
    readiness: 0.1,
    cost: 0.05,
  },
  readiness_focused: {
    gap: 0.2,
    vulnerability: 0.15,
    affected_scale: 0.15,
    readiness: 0.45,
    cost: 0.05,
  },
  vulnerability_focused: {
    gap: 0.2,
    vulnerability: 0.45,
    affected_scale: 0.15,
    readiness: 0.15,
    cost: 0.05,
  },
};

/** Turn an engine-keyed preset into the request's own weight vocabulary. */
export function presetToWeights(preset: Record<string, number>): PlannerWeights {
  const out = { ...DEFAULT_PLANNER_WEIGHTS };
  WEIGHT_ORDER.forEach((user) => {
    const engine = USER_TO_ENGINE[user];
    if (typeof preset[engine] === "number") out[user] = preset[engine];
  });
  return out;
}

/**
 * How a component's availability reads.
 *
 * `null` on a priority row means the component was excluded, not that it scored
 * zero: its weight was redistributed over the components that do have data. The
 * UI must say so — printing "0.00" would present an absence as a measurement.
 */
export const COMPONENT_LABELS: Record<string, string> = {
  gap_index: "Productivity gap",
  vulnerability: "Vulnerability / exposure",
  affected_scale: "Affected scale",
  readiness: "Readiness",
  cost_constraint: "Cost constraint",
};

export function componentLabel(component: string): string {
  return COMPONENT_LABELS[component] ?? component.replace(/_/g, " ");
}

/** Human sentence for a component status, used in tooltips and notices. */
export function availabilityLabel(status: string, sourcePeriod?: string | null): string {
  switch (status) {
    case "measured":
      return sourcePeriod ? `measured (${sourcePeriod})` : "measured";
    case "proxy":
      return "documented proxy";
    case "unavailable":
      return "not available for this period";
    default:
      return "availability undetermined";
  }
}

/**
 * How a component value reads.
 *
 * `null` is an excluded component, not a component that scored zero, so it must
 * never be rendered as `0.000`. See `ComponentAvailabilityNotice`.
 */
export function componentText(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined) return "not available for this period";
  return fmtNumber(value, digits);
}

/** One sentence explaining which components were excluded, for a page notice. */
export function unavailableSummary(components: string[]): string {
  if (components.length === 0) return "";
  const labels = components.map(componentLabel);
  return `${labels.join(" and ")} ${
    labels.length === 1 ? "carries" : "carry"
  } no measured value for this period, so ${labels.length === 1 ? "its" : "their"} weight was redistributed over the components that do.`;
}

/**
 * How a robustness share reads.
 *
 * Deliberately never phrased as a probability or as confidence: the sweep varies
 * the weighting choice only, so the share says how the ranking responds to that
 * choice and nothing about the data underneath it.
 */
export function robustnessLabel(sharePct: number): string {
  if (sharePct >= 75) return "holds under most assumptions";
  if (sharePct >= 40) return "sensitive to the weighting";
  return "unstable across the weighting";
}

/** Humanise a preset id, for when the API has not supplied a label. */
export function presetFallbackLabel(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
