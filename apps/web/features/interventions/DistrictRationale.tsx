"use client";

import { Info } from "lucide-react";

import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import type { PriorityRow } from "@/types";

const COMPONENTS: { key: keyof PriorityRow; label: string }[] = [
  { key: "gap", label: "Gap (normalised)" },
  { key: "vulnerability", label: "Vulnerability" },
  { key: "affected_scale", label: "Affected scale" },
  { key: "readiness", label: "Readiness" },
  { key: "cost_constraint", label: "Cost constraint (subtracted)" },
];

export function DistrictRationale({
  row,
  proxyNotes,
}: {
  row: PriorityRow | null;
  proxyNotes: string[];
}) {
  return (
    <Card>
      <CardHeader
        title="Selected rationale"
        subtitle={row ? `${row.district} · ${row.crop}` : "Select a row to explain its score"}
      />
      {!row ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          Choose an observation in the ranking to see why it scored where it did.
        </p>
      ) : (
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold text-forest-deep">
                {fmtNumber(row.score * 100, 0)}
                <span className="text-sm font-normal text-slate-400">/100</span>
              </p>
              <p className="text-[11px] text-slate-500">priority score</p>
            </div>
            <PriorityBadge band={row.band} />
          </div>

          <dl className="mt-3 space-y-2">
            {COMPONENTS.map((c) => {
              const value = row[c.key] as number;
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-xs">
                    <dt className="text-slate-600">{c.label}</dt>
                    <dd className="tabular-nums text-slate-500">{fmtNumber(value, 2)}</dd>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-forest/10">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        c.key === "cost_constraint" ? "bg-amber" : "bg-primary",
                      )}
                      style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </dl>

          <div className="mt-3 rounded-lg border border-info/20 bg-info/[0.05] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-info">
              <Info className="h-3.5 w-3.5" aria-hidden="true" /> Documented proxies
            </p>
            <ul className="mt-1 ml-4 list-disc space-y-0.5 text-[11px] text-slate-600">
              {proxyNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <SourceNote>
        Values are the component terms the Python engine actually used — the ranking is fully
        auditable.
      </SourceNote>
    </Card>
  );
}
