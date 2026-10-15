/**
 * Presentation helpers for the Intervention Priority workspaces.
 *
 * Formatting and key translation only — the browser never ranks, scores, weights
 * or re-weights a candidate. Every number these workspaces show comes from the
 * API, so this module cannot disagree with the engine. It exists so the planner
 * can keep thinking in *its own* weight names while the API stays engine-keyed.
 */

import type { DashboardFilters } from "@/lib/filters";
import { fmtNumber } from "@/lib/format";
import type {
  PlannerWeights,
  PriorityRow,
  PriorityScenarioRequest,
} from "@/types";

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

/**
 * The headline answer for the priorities workspace.
 *
 * The engine already returned the candidates in score order, so this only takes
 * a prefix. It deliberately does **not** re-sort: a browser re-rank is exactly
 * the thing the workspace is careful never to do, and re-sorting here would let
 * the headline disagree with the table underneath it.
 */
export function headlinePriorities(rows: PriorityRow[], limit: number): PriorityRow[] {
  return rows.slice(0, Math.max(0, limit));
}

/**
 * One candidate per district, in engine order - the districts where review
 * should start. A district appears once, under its best-ranked candidate, so the
 * list reads as "where to look", not as a second copy of the ranking.
 */
export function investigationAreas(rows: PriorityRow[], limit: number): PriorityRow[] {
  const wanted = Math.max(0, limit);
  if (wanted === 0) return [];
  const seen = new Set<string>();
  const out: PriorityRow[] = [];
  for (const row of rows) {
    if (seen.has(row.district)) continue;
    seen.add(row.district);
    out.push(row);
    if (out.length >= wanted) break;
  }
  return out;
}

/**
 * The tolerance the server allows on the weight total.
 *
 * Mirrors `WEIGHTS_SUM_TOLERANCE` in `app/schemas/analytics.py`. The client uses
 * it to explain a refusal *before* submitting, never to weaken it: the server
 * still validates every request.
 */
export const WEIGHTS_SUM_TOLERANCE = 0.02;

/** How many decimals a weight is displayed and submitted with. */
export const WEIGHT_DECIMALS = 4;

function round(value: number, decimals = WEIGHT_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** The total of a weighting, as it will be submitted. */
export function weightsTotal(weights: PlannerWeights): number {
  return round(WEIGHT_ORDER.reduce((sum, key) => sum + weights[key], 0));
}

/**
 * Why this weighting cannot be submitted, or `null` when it can.
 *
 * Returns a sentence that names the total and the tolerance, so the message a
 * planner reads matches the message the server would have sent - and the values
 * shown next to the sliders are the values being judged.
 */
export function weightsIssue(weights: PlannerWeights): string | null {
  const negative = WEIGHT_ORDER.filter((key) => !(weights[key] >= 0));
  if (negative.length) {
    return `${negative.map(weightLabel).join(", ")} must not be negative.`;
  }
  const total = weightsTotal(weights);
  if (total <= 0) {
    return "All weights are zero, so there is nothing to rank by. Set at least one weight above zero.";
  }
  if (Math.abs(total - 1) > WEIGHTS_SUM_TOLERANCE) {
    return `Weights total ${total.toFixed(2)}. They must total 1.00 (within ${WEIGHTS_SUM_TOLERANCE}).`;
  }
  return null;
}

/** The planner-facing name for one weight key. */
export function weightLabel(key: keyof PlannerWeights): string {
  return WEIGHT_LABELS[key] ?? key;
}

/** The planner-facing names, in presentation order. */
export const WEIGHT_LABELS: Record<keyof PlannerWeights, string> = {
  gap: "Productivity gap",
  vulnerability: "Vulnerability",
  affected_scale: "Affected scale",
  readiness: "Readiness",
  cost: "Cost constraint",
};

/**
 * Move one weight and keep the weighting valid.
 *
 * A slider that only changes one of five values cannot keep a five-way total at
 * 1.00, so the remaining weight is redistributed over the *other* keys in
 * proportion to what they already were. That makes the rebalance a deterministic
 * function of the previous position - the same drag always produces the same
 * weighting - and it means the total is never invalid after a slider move, so
 * the "weights must total 1.00" refusal is unreachable from this control.
 *
 * Proportional rather than equal redistribution is the point: a planner who has
 * deliberately put 45% on readiness keeps it the largest of the remainder when
 * they move the gap slider.
 *
 * The residual from rounding is assigned to the largest remaining key, so the
 * submitted total is exactly 1 (to `WEIGHT_DECIMALS`) rather than drifting a
 * little further with every drag of the slider.
 */
export function rebalanceWeights(
  weights: PlannerWeights,
  key: keyof PlannerWeights,
  value: number,
): PlannerWeights {
  const target = Math.min(1, Math.max(0, value));
  const others = WEIGHT_ORDER.filter((other) => other !== key);
  const remaining = 1 - target;

  const previousTotal = others.reduce((sum, other) => sum + Math.max(0, weights[other]), 0);
  const shares = others.map((other) => {
    if (previousTotal > 0) return Math.max(0, weights[other]) / previousTotal;
    // Every other weight is zero: fall back to an equal split, which is the
    // neutral choice and still deterministic.
    return 1 / others.length;
  });

  const next = { ...weights, [key]: round(target) } as PlannerWeights;
  others.forEach((other, index) => {
    next[other] = round(remaining * shares[index]);
  });

  // Assign the rounding residual to the largest remaining key so the total is
  // exactly 1 rather than "close enough that the server might disagree".
  const residual = round(remaining - others.reduce((sum, other) => sum + next[other], 0));
  if (residual !== 0) {
    const largest = others.reduce((a, b) => (next[a] >= next[b] ? a : b));
    next[largest] = round(next[largest] + residual);
  }
  return next;
}

/**
 * Scale a weighting onto the simplex without changing its shape.
 *
 * Used only when a stored or preset weighting arrives that is not a valid
 * request (it does not total 1): the ratios the planner chose are preserved, so
 * the submitted request matches what the sliders display.
 */
export function normalizeWeights(weights: PlannerWeights): PlannerWeights {
  const total = WEIGHT_ORDER.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
  if (total <= 0) return { ...DEFAULT_PLANNER_WEIGHTS };
  const scaled = {} as PlannerWeights;
  WEIGHT_ORDER.forEach((key) => {
    scaled[key] = round(Math.max(0, weights[key]) / total);
  });
  const residual = round(1 - WEIGHT_ORDER.reduce((sum, key) => sum + scaled[key], 0));
  if (residual !== 0) {
    const largest = WEIGHT_ORDER.reduce((a, b) => (scaled[a] >= scaled[b] ? a : b));
    scaled[largest] = round(scaled[largest] + residual);
  }
  return scaled;
}

/**
 * The one builder for `POST /scenarios/priority`.
 *
 * Every field is named explicitly and the weights are normalized through
 * `normalizeWeights`, so the request carries exactly the five public field names
 * the API documents and never the engine-keyed dictionary a response returns.
 * Both sides are built from the same function, so a scenario side cannot
 * accidentally inherit the other side's assumptions.
 */
export function buildPriorityScenarioRequest(input: {
  filters: DashboardFilters;
  baselineWeights: PlannerWeights;
  scenarioWeights: PlannerWeights;
  /** Overrides the page's period for the scenario side; empty means "same". */
  scenarioPeriod?: string;
  topN?: number;
  minScore?: number;
}): PriorityScenarioRequest {
  const { filters, baselineWeights, scenarioWeights, scenarioPeriod, topN, minScore } = input;
  const scope = {
    benchmark_strategy: filters.benchmark ?? null,
    province: filters.province ?? null,
    district: filters.district ?? null,
    crop: filters.crop ?? null,
  };

  return {
    baseline: {
      weights: normalizeWeights(baselineWeights),
      period_code: filters.period ?? null,
      ...scope,
      ...(topN === undefined ? {} : { top_n: topN }),
      ...(minScore === undefined ? {} : { min_score: minScore }),
    },
    scenario: {
      weights: normalizeWeights(scenarioWeights),
      // Falling back to the page's period keeps the default comparison a pure
      // re-weighting over an identical candidate set.
      period_code: scenarioPeriod || filters.period || null,
      ...scope,
      ...(topN === undefined ? {} : { top_n: topN }),
      ...(minScore === undefined ? {} : { min_score: minScore }),
    },
  };
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
