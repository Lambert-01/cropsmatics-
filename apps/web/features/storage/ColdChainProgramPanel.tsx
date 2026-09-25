"use client";

import { MapPinOff, Users } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { DataBadge } from "@/components/ui/DataBadge";
import { EmptyState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { ColdChainProgram } from "@/types";

/**
 * MINAGRI-ACES cold-chain program context.
 *
 * The announcement verifies *program membership* (10 packhouses, 6 named
 * districts) but publishes no facility capacity and no coordinates. This panel
 * shows exactly that and states the missing parts explicitly rather than leaving
 * a blank cell that could read as zero.
 */
export function ColdChainProgramPanel({ program }: { program?: ColdChainProgram }) {
  const indicators = program?.indicators ?? [];
  const districts = program?.program_districts ?? [];

  return (
    <Card>
      <CardHeader
        title="Cold-chain program context (2026)"
        subtitle="MINAGRI–ACES packhouse network — program level, not facility level"
        action={<DataBadge kind="verified_program" />}
      />

      {indicators.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="The cold-chain program table is not built yet."
            hint="Run the data pipeline (make data) to ingest the MINAGRI add-on."
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-3 px-4 py-4 sm:grid-cols-2">
            {indicators.map((ind) => (
              <li key={ind.indicator} className="rounded-xl border border-forest/10 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {ind.indicator}
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-forest-deep">
                  {fmtNumber(ind.value, 0)}
                  {ind.unit ? (
                    <span className="ml-1 text-xs font-normal text-slate-500">{ind.unit}</span>
                  ) : null}
                </p>
                {ind.notes ? (
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{ind.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>

          {districts.length > 0 ? (
            <div className="border-t border-forest/10 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Program districts ({districts.length})
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {districts.map((d) => (
                  <li key={d} className="chip">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {/* Facility-level data is genuinely absent — say so instead of leaving a hole. */}
      <div className="border-t border-forest/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <DataBadge kind="facility_unavailable" />
          <DataBadge kind="not_verified" />
        </div>
        <p className="mt-2 flex items-start gap-2 text-[11px] text-slate-600">
          <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <span>
            No facility-level capacity and no exact facility coordinates are published for this
            program. Program membership is verified; a specific packhouse location and its capacity
            are <strong>not</strong>. Cropmatics does not estimate them.
          </span>
        </p>
      </div>

      <SourceNote>{program?.note ?? "Program-level indicators from the official announcement."}</SourceNote>
    </Card>
  );
}
