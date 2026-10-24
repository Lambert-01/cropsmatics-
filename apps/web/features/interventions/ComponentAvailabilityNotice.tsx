"use client";

import { Info } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { availabilityLabel, componentLabel } from "@/lib/priority";
import type { ComponentAvailability } from "@/types";

/**
 * What the priority score is actually made of, for the selected period.
 *
 * Rendered wherever a ranking, map or sweep is shown. It exists so that a missing
 * component is *stated* rather than inferred from a component that reads 0: the
 * page must never let a reader assume that readiness or cost constraint was
 * measured for a period whose release does not carry them.
 */
export function ComponentAvailabilityNotice({
  availability,
  unavailable,
  title = "What this score is made of",
}: {
  availability: ComponentAvailability[];
  unavailable: string[];
  title?: string;
}) {
  if (availability.length === 0 && unavailable.length === 0) return null;

  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Info className="h-3.5 w-3.5 text-info" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {availability.map((entry) => (
          <li key={entry.component} className="flex items-baseline gap-2 text-[11px]">
            <span
              className={
                entry.status === "unavailable"
                  ? "chip border-amber/40 bg-amber/10 text-amber-800"
                  : entry.status === "measured"
                    ? "chip border-success/30 bg-success/10 text-green-800"
                    : "chip"
              }
            >
              {availabilityLabel(entry.status, entry.source_period)}
            </span>
            <span className="font-medium text-slate-700">{entry.label || componentLabel(entry.component)}</span>
            {entry.note ? <span className="text-slate-500">{entry.note}</span> : null}
          </li>
        ))}
      </ul>
      {unavailable.length ? (
        <p className="mt-2 rounded-lg border border-amber/25 bg-amber/[0.06] p-2.5 text-[11px] text-slate-600">
          Excluded from the score for this period:{" "}
          <strong>{unavailable.map(componentLabel).join(", ")}</strong>. Their weight was
          redistributed over the components that do have measured values, so no neutral
          constant is presented as an observation.
        </p>
      ) : null}
    </Card>
  );
}
