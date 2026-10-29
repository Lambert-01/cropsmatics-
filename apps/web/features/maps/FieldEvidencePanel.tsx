"use client";

import { MapPinned } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { FieldObservationsResponse } from "@/types";

export function FieldEvidencePanel({
  data,
  isLoading,
  isError,
  onRetry,
  onSelectDistrict,
}: {
  data?: FieldObservationsResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectDistrict: (district: string) => void;
}) {
  if (isError && !data) {
    return <ErrorState message="Plot evidence could not be loaded." onRetry={onRetry} />;
  }
  if (isLoading && !data) {
    return <TableSkeleton rows={5} />;
  }

  return (
    <Card>
      <CardHeader
        title="Field evidence and allocation"
        subtitle="NISR/AHS plot-crop sample aggregated to a privacy-safe district view"
        action={<MapPinned className="h-4 w-4 text-primary" aria-hidden="true" />}
      />
      <div className="px-4 pb-4 pt-3">
        {!data?.available || data.rows.length === 0 ? (
          <EmptyState
            title="No approved plot or crop microdata is loaded"
            hint={data?.message ?? "Add an authorised NISR or AHS export to the microdata input folder."}
          />
        ) : (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-4">
              <Stat label="Plot-crop records" value={fmtNumber(data.n_plot_records)} />
              <Stat label="Area represented" value={`${fmtNumber(data.area_ha_total, 1)} ha`} />
              <Stat label="Production represented" value={`${fmtNumber(data.production_kg_total, 0)} kg`} />
              <Stat label="Boundaries" value={data.geometry_available ? `${fmtNumber(data.n_records_with_geometry)} available` : "Not supplied"} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-forest/10">
              <table className="min-w-[720px] w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">District</th>
                    <th className="px-3 py-2">Crop</th>
                    <th className="px-3 py-2">Plots</th>
                    <th className="px-3 py-2">Area (ha)</th>
                    <th className="px-3 py-2">Production (kg)</th>
                    <th className="px-3 py-2">Yield (kg/ha)</th>
                    <th className="px-3 py-2">Boundary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-forest/10">
                  {data.rows.slice(0, 50).map((row) => (
                    <tr key={`${row.period_code}-${row.district_code}-${row.crop}`} className="text-slate-700 dark:text-slate-100">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="font-semibold text-primary underline-offset-2 hover:underline"
                          onClick={() => row.district && onSelectDistrict(row.district)}
                        >
                          {row.district ?? "Unknown district"}
                        </button>
                      </td>
                      <td className="px-3 py-2">{row.crop ?? "Unresolved crop"}</td>
                      <td className="px-3 py-2">{fmtNumber(row.n_plots)}</td>
                      <td className="px-3 py-2">{fmtNumber(row.area_ha, 1)}</td>
                      <td className="px-3 py-2">{fmtNumber(row.production_kg, 0)}</td>
                      <td className="px-3 py-2">{fmtNumber(row.yield_kg_ha, 0)}</td>
                      <td className="px-3 py-2">{row.geometry_available ? `${row.n_with_geometry} supplied` : "Not supplied"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-300">
              Exact field locations are not inferred from district boundaries. Use a verified geometry source before showing individual fields.
            </p>
          </>
        )}
        {data?.provenance ? <SourceNote>Source: {data.provenance.source_id ?? "No microdata loaded"} · {data.provenance.method}</SourceNote> : null}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-forest/10 bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-300">{label}</p>
      <p className="mt-1 font-semibold text-forest dark:text-white">{value}</p>
    </div>
  );
}
