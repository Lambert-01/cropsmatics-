"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import type { DashboardFilters } from "@/lib/filters";
import { forecastHeadline, policyLine, skillText } from "@/lib/forecast";
import { fmtNumber, fmtPct } from "@/lib/format";
import { useForecastStatus } from "@/services/hooks/useAnalytics";
import type { ForecastTargetDecision } from "@/types";

export function ForecastPanel({ filters = {} }: { filters?: DashboardFilters }) {
  const status = useForecastStatus(filters);
  if (status.isLoading) return <KpiRowSkeleton count={2} />;
  if (status.error && !status.data) {
    return <ErrorState message="Forecast information could not be loaded." onRetry={() => status.refetch()} />;
  }
  const data = status.data;
  if (!data) return null;
  const headline = forecastHeadline(data);
  const policy = policyLine(data);
  const published = data.serves_forecast;
  return (
    <div className="space-y-4">
      {status.error ? (
        <ErrorState message="Showing saved forecast information. Refresh failed." onRetry={() => status.refetch()} />
      ) : null}
      <div className={`flex items-start gap-3 border-l-4 p-4 ${published ? "border-success bg-success/5" : "border-amber bg-amber/5"}`} role="status">
        {published ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-forest-deep">{headline.title}</h2>
          <p className="mt-1 text-xs text-slate-600">{data.note}</p>
        </div>
      </div>
      {data.targets.length ? (
        <Card>
          <CardHeader title="Forecast outlook" subtitle="Model estimates, not observed harvests or promised gains." />
          {published ? (
            <ul className="divide-y divide-forest/5">
              {data.targets.map((target) => (
                <ForecastTargetRow key={target.target_id ?? target.label} target={target} allowed={published} />
              ))}
            </ul>
          ) : (
            <details className="border-t border-forest/5">
              <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-forest outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                Show validation checks ({data.targets.length})
              </summary>
              <ul className="divide-y divide-forest/5">
                {data.targets.map((target) => (
                  <ForecastTargetRow key={target.target_id ?? target.label} target={target} allowed={published} />
                ))}
              </ul>
            </details>
          )}
        </Card>
      ) : null}
      <details className="border-t border-forest/10 pt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-forest">Sources and methods</summary>
        <div className="mt-3 space-y-2">
          {data.scope_note ? <p>{data.scope_note}</p> : null}
          {policy ? <p>{policy}</p> : null}
          {data.method_note ? <p>{data.method_note}</p> : null}
          <p>
            Source: chronological backtest{data.generated ? ` / ${data.generated}` : ""}.
            {" "}{(data.provenance.limitations ?? []).join(" / ")}
          </p>
        </div>
      </details>
    </div>
  );
}

function ForecastTargetRow({ target, allowed }: { target: ForecastTargetDecision; allowed: boolean }) {
  const published = allowed && target.status === "ok";
  const bounds = target.interval;
  const hasInterval = Array.isArray(bounds) && bounds.length === 2 && bounds.every((n) => typeof n === "number" && Number.isFinite(n));
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-medium text-forest-deep">{target.label ?? target.target_id ?? "Forecast target"}</h3>
        <span className={`shrink-0 text-xs font-semibold ${published ? "text-success" : "text-amber"}`}>
          {published ? "Published" : "Withheld"}
        </span>
      </div>
      {published && typeof target.point_estimate === "number" ? (
        <div className="mt-3">
          <p className="text-xs text-slate-500">Forecast for {target.next_period ?? "the next period"}</p>
          <p className="mt-1 text-xl font-semibold text-forest-deep">
            {fmtNumber(target.point_estimate, 1)} <span className="text-sm font-normal">{target.unit ?? ""}</span>
          </p>
          {hasInterval ? (
            <p className="mt-1 text-xs text-slate-600">
              {typeof target.interval_level === "number" ? `${fmtPct(target.interval_level * 100, 0)} ` : ""}
              interval: {fmtNumber(bounds![0], 1)} to {fmtNumber(bounds![1], 1)} {target.unit ?? ""}
            </p>
          ) : <p className="mt-1 text-xs text-slate-500">Interval unavailable</p>}
        </div>
      ) : null}
      <details className="mt-2 text-xs text-slate-600">
        <summary className="cursor-pointer">{published ? "Validation details" : "Why withheld?"}</summary>
        <div className="mt-2 space-y-2">
          <p>{target.n_series_eligible}/{target.n_series} series have enough history.</p>
          {skillText(target.skill_vs_naive) !== null ? <p>Performance against the baseline: {skillText(target.skill_vs_naive)}</p> : null}
          {target.model ? <p>Model: {target.model}</p> : null}
          {target.reasons.length ? <ul className="list-inside list-disc space-y-1">{target.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
          {!target.reasons.length && target.decision_note ? <p>{target.decision_note}</p> : null}
        </div>
      </details>
    </li>
  );
}
