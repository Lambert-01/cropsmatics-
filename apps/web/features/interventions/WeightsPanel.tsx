"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  rebalanceWeights,
  weightsIssue,
  weightsTotal,
  WEIGHT_LABELS,
  WEIGHT_ORDER,
} from "@/lib/priority";
import type { PlannerWeights } from "@/types";

export type Weights = PlannerWeights;

export const DEFAULT_WEIGHTS: Weights = {
  gap: 0.3,
  vulnerability: 0.2,
  affected_scale: 0.2,
  readiness: 0.2,
  cost: 0.1,
};

/**
 * What each weight is made of, in the planner's words.
 *
 * Harvested area is an **exposure proxy** and land share is a **cost proxy**;
 * neither is described as a measured count of farmers or a measured cost, because
 * the published tables do not contain either.
 */
const HINTS: Record<keyof Weights, string> = {
  gap: "How far below its benchmark the yield is",
  vulnerability: "Crop perishability proxy (documented)",
  affected_scale: "Harvested area — exposure proxy, not farmer counts",
  readiness: "Existing practice uptake proxy",
  cost: "Subtracted; land-share proxy",
};

export function WeightsPanel({
  weights,
  onChange,
  onReset,
  onRun,
  isRunning,
  dirty,
  scopeNote,
}: {
  weights: Weights;
  onChange: (weights: Weights) => void;
  onReset: () => void;
  onRun: () => void;
  isRunning: boolean;
  dirty: boolean;
  /** Why this weighting ranks the candidates it does, in one line. */
  scopeNote?: string;
}) {
  const total = weightsTotal(weights);
  const issue = weightsIssue(weights);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="card-title">Planning weights</h2>
      </div>
      <p className="card-subtitle mt-1">
        Moving one slider rebalances the others. Python recomputes the ranking.
      </p>

      <div className="mt-4 space-y-3">
        {WEIGHT_ORDER.map((key) => (
          <div key={key}>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`w-${key}`} className="font-medium text-slate-700">
                {WEIGHT_LABELS[key]}
              </label>
              <span className="tabular-nums text-slate-500">{weights[key].toFixed(2)}</span>
            </div>
            <input
              id={`w-${key}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[key]}
              aria-describedby={`w-${key}-hint`}
              onChange={(event) =>
                // The rebalance is deterministic: the same drag always produces
                // the same weighting, and the total stays at 1.00, so the
                // sliders cannot build a request the server would refuse.
                onChange(rebalanceWeights(weights, key, Number(event.target.value)))
              }
              className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-forest/15 accent-primary"
            />
            <p id={`w-${key}-hint`} className="mt-0.5 text-[11px] text-slate-400">
              {HINTS[key]}
            </p>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "mt-4 rounded-lg px-3 py-2 text-xs",
          issue ? "bg-danger/10 text-danger" : "bg-success/10 text-success",
        )}
        role={issue ? "alert" : undefined}
      >
        <span className="font-medium tabular-nums">Total {total.toFixed(2)}</span>
        {issue ? <span className="mt-0.5 block">{issue}</span> : <span> — ready</span>}
      </div>

      {scopeNote ? <p className="mt-2 text-[11px] text-slate-500">{scopeNote}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={onRun}
          disabled={isRunning || Boolean(issue)}
          title={issue ?? undefined}
        >
          {isRunning ? "Recomputing…" : dirty ? "Apply weights" : "Recompute"}
        </button>
        <button type="button" className="btn" onClick={onReset} aria-label="Reset weights">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
