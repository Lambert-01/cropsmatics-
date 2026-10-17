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

  if (!personal && form.baseline === "median_window" && form.windowSize) {
    body.baseline_window = form.windowSize;
  }
  if (form.method === "percent_change") {
    body.change_pct = form.changePct ?? 0;
    body.compounding = form.compounding ?? "once";
  }
  if (personal) {
    body.assumed_yield_kg_ha = form.assumedYield ?? null;
    body.assumed_harvested_area_ha = form.assumedArea ?? null;
  }
  return body;
}
