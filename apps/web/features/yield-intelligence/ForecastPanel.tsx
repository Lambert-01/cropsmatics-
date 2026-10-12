"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { forecastHeadline, policyLine, skillText } from "@/lib/forecast";
import { fmtNumber, fmtPct } from "@/lib/format";
import { useForecastStatus } from "@/services/hooks/useAnalytics";
import type { ForecastTargetDecision } from "@/types";

/**
 * The Forecast workspace: the publication gate, rendered.
 *
 * This panel exists to state — with the backtest's own numbers — whether a
 * next-season forecast may be served. When the gate says no, the reasons the
 * gate recorded are the content of the page: an honest "the published record
 * cannot validate this" is a complete answer, and hiding the workspace or
 * showing a placeholder would be the invented-precision failure the platform
 * avoids everywhere else.
 *
 * Nothing here is computed: statuses, counts, skill and notes come verbatim
 * from `GET /analytics/forecast-status`.
 */
export function ForecastPanel() {
  const status = useForecastStatus();

  if (status.isLoading) return <KpiRowSkeleton count={2} />;

  if (status.error) {
    return (
      <ErrorState
        message={(status.error as Error).message}
        onRetry={() => status.refetch()}
      />
    );
  }

  const data = status.data;
  if (!data) return null;

  const headline = forecastHeadline(data);
  const policy = policyLine(data);
  const toneClass =
    headline.tone === "published"
      ? "border-success/25 bg-success/[0.05]"
      : headline.tone === "suppressed"
        ? "border-amber/25 bg-amber/[0.05]"
        : "border-slate-300 bg-slate-50";
  const toneIcon =
    headline.tone === "published" ? (
      <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
    ) : (
      <AlertTriangle
        className={`h-4 w-4 shrink-0 ${headline.tone === "suppressed" ? "text-amber" : "text-slate-400"}`}
        aria-hidden="true"
      />
    );

  return (
    <div className="space-y-5">
      <div className={`card border p-4 ${toneClass}`} role="status">
        <div className="flex items-start gap-2">
          {toneIcon}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-forest-deep">{headline.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{headline.detail}</p>
            {policy ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Publication policy: {policy}
                {data.generated ? ` · backtest generated ${data.generated}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {data.targets.length > 0 ? (
        <Card>
          <CardHeader
            title="Candidate forecast targets"
            subtitle="Every target the backtest judged, with the gates it passed or failed"
          />
          <ul className="divide-y divide-forest/5">
            {data.targets.map((target) => (
              <ForecastTargetRow key={target.target_id ?? target.status} target={target} />
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-4 text-xs text-slate-600">
          No candidate targets are recorded in this deployment&apos;s backtest report.
        </Card>
      )}

      {data.method_note ? (
        <p className="px-1 text-xs leading-relaxed text-slate-500">{data.method_note}</p>
      ) : null}

      <SourceNote>
        Source: chronological backtest report
        {data.generated ? ` (${data.generated})` : ""}.{" "}
        {(data.provenance.limitations ?? []).join(" · ")}
      </SourceNote>
    </div>
  );
}

/** One target: status, the gates in numbers, and the blocking reasons. */
function ForecastTargetRow({ target }: { target: ForecastTargetDecision }) {
  const published = target.status === "ok";
  const skill = skillText(target.skill_vs_naive);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-forest/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-forest">
          {target.target_id ?? "unknown target"}
        </code>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            published ? "bg-success/10 text-success" : "bg-amber/10 text-amber"
          }`}
        >
          {published ? "published" : (target.status ?? "unknown")}
        </span>
        <span className="text-[11px] text-slate-500">
          {fmtNumber(target.n_series_eligible, 0)}/{fmtNumber(target.n_series, 0)} series cleared
          the history gate
        </span>
        {skill !== null ? (
          <span
            className={`text-[11px] font-semibold ${
              typeof target.skill_vs_naive === "number" && target.skill_vs_naive > 0
                ? "text-success"
                : "text-danger"
            }`}
            title="Skill of the candidate against the naive baseline, from the backtest"
          >
            skill vs naive {skill}
          </span>
        ) : null}
      </div>

      {target.decision_note ? (
        <p className="mt-1 text-xs text-slate-600">{target.decision_note}</p>
      ) : null}

      {published && target.point_estimate !== null && target.point_estimate !== undefined ? (
        <p className="mt-1 text-xs text-forest">
          Forecast for {target.next_period ?? "the next period"}:{" "}
          <strong>
            {fmtNumber(target.point_estimate, 1)} {target.unit ?? ""}
          </strong>
          {target.interval && target.interval.length === 2 ? (
            <span className="text-slate-500">
              {" "}
              (80% interval {fmtNumber(target.interval[0], 1)}–
              {fmtNumber(target.interval[1], 1)}
              {typeof target.interval_coverage === "number"
                ? `, coverage ${fmtPct(target.interval_coverage * 100, 0)}`
                : ""}
              )
            </span>
          ) : null}
        </p>
      ) : null}

      {target.reasons.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {target.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5 text-xs text-slate-500">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
