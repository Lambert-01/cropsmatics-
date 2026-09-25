"use client";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import type { FacilitiesResponse } from "@/types";

export function FacilityStatus({ data }: { data?: FacilitiesResponse }) {
  const facilities = data?.facilities ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Verified program context"
        subtitle="Cold-chain initiative districts — capacity is intentionally not assumed"
      />
      {facilities.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No verified facility context for this selection."
            hint="No capacity values are invented to fill the gap."
          />
        </div>
      ) : (
        <div className="thin-scroll mt-3 max-h-[24rem] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>District</th>
                <th>Initiative</th>
                <th>Capacity</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => (
                <tr key={`${f.district}-${f.initiative}`}>
                  <td className="font-medium text-slate-700">{f.district}</td>
                  <td className="text-slate-600">{f.initiative}</td>
                  <td>
                    <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[11px] font-medium text-amber">
                      Capacity not verified
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{f.source_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SourceNote>
        Capacity is preserved as null. A null is never converted to 0 for display, and no
        hypothetical capacity is shown as if it were verified.
      </SourceNote>
    </Card>
  );
}
