/**
 * The one builder for `POST /scenarios/manual-projection`.
 *
 * Kept out of the component so the same function the form uses is the one a
 * contract test checks against the shared fixture — the Python endpoint test and
 * this builder read `services/api/tests/fixtures/manual_projection_contract.json`,
 * so the two sides cannot drift.
 *
 * The builder only shapes the request. It never computes a projected number and
 * never decides whether a selection is valid: the backend is the authority for
 * both, and the returned request is exactly what the API receives.
 */

import type {
  ManualProjectionRequest,
  ProjectionBaseline,
  ProjectionCase,
  ProjectionCompounding,
  ProjectionMethod,
  ProjectionMetric,
} from "@/types";

export interface ManualProjectionForm {
  crop: string;
  district?: string | null;
  season: "A" | "B" | "C";
  method: ProjectionMethod;
  baseline: ProjectionBaseline;
  horizon: number;
  metric: ProjectionMetric;
  windowSize?: number | null;
  changePct?: number | null;
  compounding?: ProjectionCompounding;
  assumedYield?: number | null;
  assumedArea?: number | null;
  /** Planning origin period; omitted entirely when not chosen. */
  originPeriod?: string | null;
  /** lower/main/higher assumption cases; omitted when not requested. */
  cases?: ProjectionCase[] | null;
}

export function manualProjectionRequest(form: ManualProjectionForm): ManualProjectionRequest {
  const personal = form.method === "personal";
  const body: ManualProjectionRequest = {
    crop: form.crop,
    geography: form.district ? "district" : "national",
    district: form.district ?? null,
    season: form.season,
    horizon_steps: form.horizon,
    // A personal plan always estimates production; the backend refuses the
    // mismatch rather than silently converting an assumed farm yield into one.
    metric: personal ? "production_mt" : form.metric,
    method: form.method,
    baseline: form.baseline,
  };

  if (form.originPeriod) {
    body.origin_period = form.originPeriod;
  }
  if (!personal && form.baseline === "median_window" && form.windowSize) {
    body.baseline_window = form.windowSize;
  }
  if (form.method === "percent_change") {
    body.change_pct = form.changePct ?? 0;
    body.compounding = form.compounding ?? "once";
  }
  if (form.cases?.length) {
    body.cases = form.cases;
  }
  if (personal) {
    body.assumed_yield_kg_ha = form.assumedYield ?? null;
    body.assumed_harvested_area_ha = form.assumedArea ?? null;
  }
  return body;
}

// --- shareable plans ---------------------------------------------------------

/**
 * Format version of a plan embedded in a `?plan=` share link. Bump only with
 * a migration story: an unknown version is rejected with its version number
 * in the message rather than re-read, because silently accepting a format the
 * build does not know could change what its numbers mean.
 */
export const PLAN_VERSION = 1;

const PLAN_METHODS: ProjectionMethod[] = ["carry_forward", "percent_change", "personal"];
const PLAN_BASELINES: ProjectionBaseline[] = ["latest_observed", "median_window"];
const PLAN_COMPOUNDING: ProjectionCompounding[] = ["once", "per_step"];
const PLAN_CASE_LABELS = ["lower", "main", "higher"] as const;
const PERIOD_CODE = /^\d{4}[ABC]$/;
const CHANGE_MIN = -95;
const CHANGE_MAX = 500;

type PlanFailure = { ok: false; error: string };
type PlanSuccess = { ok: true; form: ManualProjectionForm };
export type PlanRestore = PlanSuccess | PlanFailure;

function validatePlanForm(raw: unknown): PlanRestore {
  const fail = (error: string): PlanFailure => ({ ok: false, error });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("it does not contain a plan object");
  }
  const f = raw as Record<string, unknown>;
  if (typeof f.crop !== "string" || f.crop.trim() === "") return fail("its crop is missing");
  if (f.season !== "A" && f.season !== "B" && f.season !== "C") {
    return fail(`its season (${String(f.season)}) is not A, B or C`);
  }
  if (!PLAN_METHODS.includes(f.method as ProjectionMethod)) {
    return fail(`its method (${String(f.method)}) is unknown`);
  }
  if (!PLAN_BASELINES.includes(f.baseline as ProjectionBaseline)) {
    return fail(`its baseline (${String(f.baseline)}) is unknown`);
  }
  if (!Number.isInteger(f.horizon) || (f.horizon as number) < 1 || (f.horizon as number) > 3) {
    return fail("its horizon must be 1, 2 or 3 same-season steps");
  }
  if (f.metric !== "yield_kg_ha" && f.metric !== "production_mt") {
    return fail(`its metric (${String(f.metric)}) is unknown`);
  }
  if (f.district != null && typeof f.district !== "string") return fail("its district is malformed");
  if (
    f.windowSize != null &&
    (!Number.isInteger(f.windowSize) || (f.windowSize as number) < 2 || (f.windowSize as number) > 8)
  ) {
    return fail("its baseline window must be between 2 and 8 observations");
  }
  if (
    f.changePct != null &&
    (typeof f.changePct !== "number" ||
      !Number.isFinite(f.changePct) ||
      f.changePct < CHANGE_MIN ||
      f.changePct > CHANGE_MAX)
  ) {
    return fail(`its assumed change must be between ${CHANGE_MIN}% and ${CHANGE_MAX}%`);
  }
  if (f.compounding != null && !PLAN_COMPOUNDING.includes(f.compounding as ProjectionCompounding)) {
    return fail(`its compounding option (${String(f.compounding)}) is unknown`);
  }
  if (f.assumedYield != null && (typeof f.assumedYield !== "number" || !(f.assumedYield > 0))) {
    return fail("its assumed yield must be a positive number");
  }
  if (f.assumedArea != null && (typeof f.assumedArea !== "number" || !(f.assumedArea > 0))) {
    return fail("its assumed area must be a positive number");
  }
  if (f.originPeriod != null && (typeof f.originPeriod !== "string" || !PERIOD_CODE.test(f.originPeriod))) {
    return fail("its origin period is not a season code like 2025B");
  }
  if (f.cases != null) {
    if (!Array.isArray(f.cases) || f.cases.length > 3) return fail("its assumption cases are malformed");
    // The backend refuses bands on the other two methods (they would be
    // silently meaningless there); a link claiming them is refused here too
    // rather than restored into a plan that cannot calculate.
    if (f.method !== "percent_change") {
      return fail("its assumption bands belong to the 'Apply a change' method only");
    }
    const seen = new Set<string>();
    const byLabel = new Map<string, number>();
    for (const entry of f.cases) {
      if (typeof entry !== "object" || entry === null) return fail("its assumption cases are malformed");
      const { label, change_pct: value } = entry as { label?: unknown; change_pct?: unknown };
      if (typeof label !== "string" || !PLAN_CASE_LABELS.includes(label as (typeof PLAN_CASE_LABELS)[number])) {
        return fail("its case labels must be lower, main or higher");
      }
      if (seen.has(label)) return fail(`its "${label}" case appears more than once`);
      seen.add(label);
      if (typeof value !== "number" || !Number.isFinite(value) || value < CHANGE_MIN || value > CHANGE_MAX) {
        return fail(`its "${label}" case must be between ${CHANGE_MIN}% and ${CHANGE_MAX}%`);
      }
      byLabel.set(label, value);
    }
    // Every present pair must honour the promised ordering — the same rule
    // Python validates, so an inverted link is refused at restore time.
    const orderedPairs: [string, string][] = [
      ["lower", "main"],
      ["main", "higher"],
      ["lower", "higher"],
    ];
    for (const [lower, higher] of orderedPairs) {
      const lo = byLabel.get(lower);
      const hi = byLabel.get(higher);
      if (lo !== undefined && hi !== undefined && lo > hi) {
        return fail(`its "${lower}" case is above its "${higher}" case`);
      }
    }
  }
  return { ok: true, form: f as unknown as ManualProjectionForm };
}

/** Embed a plan in a share URL: `{version, form}`, nothing else. */
export function serializePlan(form: ManualProjectionForm): string {
  return JSON.stringify({ version: PLAN_VERSION, form });
}

/**
 * Read a plan back from a share link. Every rejection returns an explicit
 * message and applies nothing — an unsupported version, a malformed plan or an
 * out-of-range assumption is never silently coerced into something else.
 */
export function parsePlan(param: string): PlanRestore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(param);
  } catch {
    return {
      ok: false,
      error: "This link does not contain readable JSON, so no plan was applied.",
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "This link does not contain a plan, so nothing was applied." };
  }
  const { version, form } = parsed as { version?: unknown; form?: unknown };
  if (version !== PLAN_VERSION) {
    return {
      ok: false,
      error:
        `This link uses plan format v${version === undefined ? "unknown" : String(version)}; ` +
        `this build reads v${PLAN_VERSION}. Nothing was applied.`,
    };
  }
  const validated = validatePlanForm(form);
  if (!validated.ok) {
    return { ok: false, error: `This link's plan is not usable: ${validated.error}. Nothing was applied.` };
  }
  return validated;
}

/**
 * The same-season period codes a plan starting at `origin` projects into — a
 * mirror of Python's `next_same_season_codes`, so the form can show the
 * planning target before Calculate is pressed.
 */
export function nextSameSeasonCodes(origin: string, steps: number): string[] {
  const match = /^(\d{4})([ABC])$/.exec(origin);
  if (!match || !Number.isInteger(steps) || steps < 1) return [];
  const year = Number(match[1]);
  const letter = match[2];
  return Array.from({ length: steps }, (_, i) => `${year + i + 1}${letter}`);
}

/**
 * Whether the displayed result is older than the current inputs. Compared as
 * the exact request JSON — that request is what Python computed, so any
 * difference in it makes the on-screen result stale. Both sides come from
 * `manualProjectionRequest`, so key order is stable and the comparison is
 * exact, not best-effort.
 */
export function isStalePlan(
  calculated: ManualProjectionRequest | null | undefined,
  current: ManualProjectionRequest,
): boolean {
  if (!calculated) return false;
  return JSON.stringify(calculated) !== JSON.stringify(current);
}
