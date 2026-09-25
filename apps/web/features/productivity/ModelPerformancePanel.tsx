"use client";

import { Activity, Info } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import { useModels } from "@/services/hooks/useReference";

/** Shows real model cards only. Never fabricates metrics. */
export function ModelPerformancePanel() {
  const { data, isLoading } = useModels();

  if (isLoading) return <TableSkeleton rows={3} />;

  const models = data?.models ?? [];

  return (
    <Card>
      <CardHeader title="Model performance" subtitle="Read from real training artifacts only" />
      {models.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600">
          Model not yet trained for this selection.
        </p>
      ) : (
        <ul className="space-y-3 px-4 pb-2 pt-3">
          {models.map((m) => (
            <li key={m.name} className="rounded-lg border border-forest/10 p-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="text-sm font-medium text-forest">{m.name}</p>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    m.status === "available"
                      ? "bg-success/10 text-success"
                      : "bg-amber/10 text-amber"
                  }`}
                >
                  {m.status === "available" ? "Trained" : "Not trained"}
                </span>
              </div>
              {m.status === "available" ? (
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Metric label="MAE" value={m.mae} />
                  <Metric label="RMSE" value={m.rmse} />
                  <Metric label="R²" value={m.r2} decimals={3} />
                  {m.validation_method ? (
                    <div className="col-span-3 text-slate-500">
                      Validation: {m.validation_method}
                      {m.training_period ? ` · ${m.training_period}` : ""}
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  {m.note ?? "Run `make ml` to produce a model card."}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-start gap-2 px-4 pb-2 pt-1 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Metrics are reported only when a real model card exists. None are generated for display.
      </p>
      <SourceNote>Source: ml/reports model cards, produced by the Python training pipeline.</SourceNote>
    </Card>
  );
}

function Metric({
  label,
  value,
  decimals = 1,
}: {
  label: string;
  value?: number | null;
  decimals?: number;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-semibold text-forest-deep">{fmtNumber(value ?? null, decimals)}</dd>
    </div>
  );
}
