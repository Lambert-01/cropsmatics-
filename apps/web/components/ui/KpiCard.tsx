import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { fmtNumber, periodLabel } from "@/lib/format";
import type { KPI } from "@/types";

export function KpiCard({
  kpi,
  icon,
  accent = "primary",
}: {
  kpi: KPI;
  icon?: ReactNode;
  accent?: "primary" | "amber" | "danger" | "info" | "success";
}) {
  const value =
    kpi.value === null || kpi.value === undefined
      ? "—"
      : kpi.unit === "%"
        ? `${fmtNumber(kpi.value, 1)}%`
        : fmtNumber(kpi.value, Number.isInteger(kpi.value) ? 0 : 1);

  const accents: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber/10 text-amber",
    danger: "bg-danger/10 text-danger",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {kpi.label}
        </p>
        {icon ? (
          <span className={cn("rounded-lg p-1.5", accents[accent])} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="metric mt-2">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
        {kpi.unit && kpi.unit !== "%" ? <span>{kpi.unit}</span> : null}
        {kpi.period ? <span>· {periodLabel(kpi.period)}</span> : null}
      </div>
      {kpi.note ? <p className="mt-1 text-[11px] leading-snug text-slate-400">{kpi.note}</p> : null}
    </div>
  );
}
