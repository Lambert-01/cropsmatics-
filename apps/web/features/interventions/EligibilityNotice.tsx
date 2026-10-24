"use client";

import { CheckCircle2, MinusCircle } from "lucide-react";

import { Card } from "@/components/ui/Card";
import type { PriorityIneligibleRow } from "@/types";

/**
 * Why a district is — or is not — on this shortlist.
 *
 * The ranking only ever contains candidates with a published shortfall, so a
 * planner who cannot find the district they expected needs to be told *why* it is
 * absent: it is above its benchmark, or its benchmark could not be computed. That
 * is a different answer from "no data", and it must not be left to be inferred
 * from a missing row.
 *
 * The excluded list is deliberately collapsed: the count is the headline, the
 * per-candidate reasons are one deliberate interaction away.
 */
export function EligibilityNotice({
  purposeLabel,
  purposeNote,
  thresholdPct,
  nEligible,
  nIneligible,
  ineligible,
  referenceNote,
}: {
  purposeLabel?: string | null;
  purposeNote?: string | null;
  thresholdPct?: number;
  nEligible?: number;
  nIneligible?: number;
  ineligible?: PriorityIneligibleRow[];
  referenceNote?: string | null;
}) {
  const excluded = nIneligible ?? 0;
  if (!purposeLabel && !referenceNote) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {purposeLabel ?? "Planning purpose"}
        </p>
        <p className="text-xs text-slate-500">
          <span className="font-semibold tabular-nums text-forest-deep">{nEligible ?? 0}</span>{" "}
          eligible
          {excluded > 0 ? (
            <>
              {" · "}
              <span className="font-semibold tabular-nums text-amber-800">{excluded}</span> not a
              shortfall
            </>
          ) : null}
        </p>
      </div>

      {purposeNote ? <p className="mt-1.5 text-[11px] text-slate-600">{purposeNote}</p> : null}

      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-500">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>
          A candidate must be more than{" "}
          <strong className="tabular-nums">
            {(thresholdPct ?? 0).toFixed(1)}%
          </strong>{" "}
          below its benchmark to be listed. {referenceNote}
        </span>
      </p>

      {excluded > 0 && ineligible?.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-600">
            Why {excluded} candidate{excluded === 1 ? "" : "s"} are not listed
          </summary>
          <ul className="mt-2 space-y-1">
            {ineligible.slice(0, 25).map((entry) => (
              <li key={entry.id} className="flex items-start gap-1.5 text-[11px] text-slate-500">
                <MinusCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber" aria-hidden="true" />
                <span>
                  <strong className="font-medium text-slate-700">
                    {entry.id.replace("::", " · ")}
                  </strong>{" "}
                  — {entry.reason}
                </span>
              </li>
            ))}
          </ul>
          {ineligible.length > 25 ? (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Showing the first 25 of {excluded}.
            </p>
          ) : null}
        </details>
      ) : null}
    </Card>
  );
}
