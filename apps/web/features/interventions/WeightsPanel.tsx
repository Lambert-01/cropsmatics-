"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/cn";

export interface Weights {
  gap: number;
  vulnerability: number;
  affected_scale: number;
  readiness: number;
  cost: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  gap: 0.3,
  vulnerability: 0.2,
  affected_scale: 0.2,
  readiness: 0.2,
  cost: 0.1,
};

const ROWS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: "gap", label: "Productivity gap", hint: "How far below its benchmark the yield is" },
  { key: "vulnerability", label: "Vulnerability", hint: "Crop perishability proxy (documented)" },
  { key: "affected_scale", label: "Affected scale", hint: "Harvested-area proxy for exposure" },
  { key: "readiness", label: "Readiness", hint: "Existing practice uptake proxy" },
  { key: "cost", label: "Cost constraint", hint: "Subtracted; land-share proxy" },
];

export function WeightsPanel({
  weights,
  onChange,
  onReset,
  onRun,
  isRunning,
  dirty,
}: {
  weights: Weights;
  onChange: (weights: Weights) => void;
  onReset: () => void;
  onRun: () => void;
  isRunning: boolean;
  dirty: boolean;
}) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const balanced = Math.abs(total - 1) <= 0.02;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="card-title">Intervention weights</h2>
      </div>
      <p className="card-subtitle mt-1">
        Transparent, adjustable weights. The score is recomputed by Python on the server.
      </p>

      <div className="mt-4 space-y-3">
        {ROWS.map((row) => (
          <div key={row.key}>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`w-${row.key}`} className="font-medium text-slate-700">
                {row.label}
              </label>
              <span className="tabular-nums text-slate-500">{weights[row.key].toFixed(2)}</span>
            </div>
            <input
              id={`w-${row.key}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[row.key]}
              onChange={(e) => onChange({ ...weights, [row.key]: Number(e.target.value) })}
              className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-forest/15 accent-primary"
            />
            <p className="mt-0.5 text-[11px] text-slate-400">{row.hint}</p>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "mt-4 rounded-lg px-3 py-2 text-xs",
          balanced ? "bg-success/10 text-success" : "bg-amber/10 text-amber",
        )}
      >
        Weights sum to {total.toFixed(2)} {balanced ? "— ready" : "— will be normalised to 1.00"}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-primary flex-1" onClick={onRun} disabled={isRunning}>
          {isRunning ? "Recomputing…" : dirty ? "Apply weights" : "Recompute"}
        </button>
        <button type="button" className="btn" onClick={onReset} aria-label="Reset weights">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
