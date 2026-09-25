"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { api, reportUrl } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { useDistricts } from "@/services/hooks/useReference";
import { useFilters } from "@/services/hooks/useFilters";
import { useQuery } from "@tanstack/react-query";

const EXPORTS = [
  { label: "Productivity gap report", path: "/productivity-gap.csv", withFilters: true },
  { label: "Intervention priority report", path: "/intervention-priority.csv", withFilters: true },
  { label: "Post-harvest report", path: "/post-harvest.csv", withFilters: false },
  { label: "District crop productivity (raw processed)", path: "/dataset/district_crop_productivity.csv", withFilters: false },
  { label: "District factors (raw processed)", path: "/dataset/district_factors.csv", withFilters: false },
  { label: "National crop trends (raw processed)", path: "/dataset/national_crop_trends.csv", withFilters: false },
];

export default function ReportsPage() {
  const { filters } = useFilters();
  const { data: districts } = useDistricts();
  const [district, setDistrict] = useState<string>("");

  const summary = useQuery({
    queryKey: ["district-summary", district],
    queryFn: () => api.districtSummary(district),
    enabled: Boolean(district),
  });

  return (
    <div className="space-y-5">
      <PageHeading
        title="Reports"
        subtitle="Export Python-generated results as CSV. Every export reflects exactly what the analytics layer computed."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXPORTS.map((r) => (
          <a
            key={r.path}
            href={reportUrl(r.path, r.withFilters ? filters : undefined)}
            className="card group flex items-center gap-3 p-4 transition hover:border-primary/30"
            download
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Download className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium text-forest">{r.label}</span>
              <span className="block text-[11px] text-slate-500">
                {r.withFilters ? "Applies current filters" : "Full processed table"}
              </span>
            </span>
          </a>
        ))}
      </div>

      <Card>
        <CardHeader
          title="District summary"
          subtitle="Aggregated crop yield and production for one district"
        />
        <div className="px-4 pt-3">
          <label htmlFor="district-select" className="text-xs font-medium text-slate-600">
            District
          </label>
          <select
            id="district-select"
            className="input mt-1 w-full max-w-sm"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">Select a district…</option>
            {(districts ?? []).map((d) => (
              <option key={d.district_code} value={d.district}>
                {d.district}
              </option>
            ))}
          </select>
        </div>

        <div className="px-4 pb-4 pt-3">
          {!district ? (
            <EmptyState
              title="Choose a district to view its summary."
              hint="Exports above work with or without a selection."
            />
          ) : summary.isLoading ? (
            <TableSkeleton rows={5} />
          ) : summary.error ? (
            <ErrorState
              message={(summary.error as Error).message}
              onRetry={() => summary.refetch()}
            />
          ) : summary.data && summary.data.crops.length > 0 ? (
            <div className="thin-scroll max-h-[24rem] overflow-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Crop</th>
                    <th className="text-right">Median yield (kg/ha)</th>
                    <th className="text-right">Production (mt)</th>
                    <th className="text-right">Harvested area (ha)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.crops.map((c, i) => (
                    <tr key={i}>
                      <td className="font-medium text-slate-700">{String(c.crop)}</td>
                      <td className="text-right">
                        {fmtNumber(c.crop_yield_median_kg_ha as number, 0)}
                      </td>
                      <td className="text-right">{fmtNumber(c.production_mt as number, 0)}</td>
                      <td className="text-right">{fmtNumber(c.harvested_area_ha as number, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
        <SourceNote>
          <FileText className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Summaries are aggregated from the processed district × crop table (NISR 2025 Season B).
        </SourceNote>
      </Card>
    </div>
  );
}
