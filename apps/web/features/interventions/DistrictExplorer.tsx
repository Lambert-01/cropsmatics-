"use client";

import { MapPin } from "lucide-react";
import { useMemo, useState } from "react";

import { ResponsiveTable, type Column } from "@/components/table/ResponsiveTable";
import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { RwandaDistrictMap } from "@/features/maps/RwandaDistrictMap";
import type { MapMetricId } from "@/lib/constants";
import type { DashboardFilters } from "@/lib/filters";
import { fmtNumber } from "@/lib/format";
import { useMapMetrics, usePriorities } from "@/services/hooks/useAnalytics";
import type { PriorityRow } from "@/types";

import { DistrictRationale } from "./DistrictRationale";
import { ScoreComponentChart } from "./ScoreComponentChart";

/**
 * DISTRICT EXPLORER workspace.
 *
 * A district-first read of the same published candidates the ranking uses: pick a
 * district and see every crop it was tabulated for, scored against the same
 * benchmark and with the same auditable components. Selecting a district here is
 * display-only — it filters an already-computed response and never re-ranks.
 */
export function DistrictExplorer({ filters }: { filters: DashboardFilters }) {
  const priorities = usePriorities(filters, 200, true);
  const [metric, setMetric] = useState<MapMetricId>("priority");
  const map = useMapMetrics(filters, metric, true);
  const [selected, setSelected] = useState<string>("");

  const rows = priorities.data?.rows ?? [];

  const districts = useMemo(() => {
    const seen: string[] = [];
    rows.forEach((row) => {
      if (!seen.includes(row.district)) seen.push(row.district);
    });
    return seen;
  }, [rows]);

  // Default to the highest-ranked district: the one the ranking already put first.
  const activeDistrict = selected || districts[0] || "";

  const districtRows = useMemo(
    () => rows.filter((row) => row.district === activeDistrict),
    [rows, activeDistrict],
  );
  const top = districtRows[0] ?? null;
  const proxyNotes = priorities.data?.proxy_notes ?? [];

  const columns: Column<PriorityRow>[] = [
    {
      id: "crop",
      header: "Crop",
      width: 140,
      sticky: true,
      sortable: true,
      sortValue: (row) => row.crop,
      cell: (row) => <span className="font-medium text-slate-700">{row.crop}</span>,
    },
    {
      id: "yield",
      header: "Observed yield",
      unit: "kg/ha",
      width: 120,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => row.yield_kg_ha ?? null,
      cell: (row) => fmtNumber(row.yield_kg_ha, 0),
    },
    {
      id: "benchmark",
      header: "Benchmark",
      unit: "kg/ha",
      width: 120,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => row.benchmark_yield_kg_ha ?? null,
      cell: (row) => fmtNumber(row.benchmark_yield_kg_ha, 0),
    },
    {
      id: "gap",
      header: "Gap",
      unit: "%",
      width: 90,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => row.gap,
      cell: (row) => `${fmtNumber(row.gap, 1)}%`,
    },
    {
      id: "score",
      header: "Priority score",
      width: 110,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (row) => row.score,
      cell: (row) => <span className="font-medium">{Math.round(row.score * 100)}</span>,
    },
    {
      id: "band",
      header: "Band",
      width: 120,
      cell: (row) => <PriorityBadge band={row.band} />,
    },
  ];

  if (priorities.error) {
    return (
      <ErrorState
        message={(priorities.error as Error).message}
        onRetry={() => priorities.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-[11px] font-medium text-slate-600">District</span>
            <select
              className="input w-full"
              value={activeDistrict}
              onChange={(event) => setSelected(event.target.value)}
            >
              {districts.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className="flex items-center gap-1.5 pb-2 text-[11px] text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {top ? (
              <>
                <span className="font-medium text-slate-700">{activeDistrict}</span> holds{" "}
                {districtRows.length} published crop
                {districtRows.length === 1 ? "" : "s"} for this selection
              </>
            ) : (
              "No published candidates for this selection"
            )}
          </p>
        </div>
      </Card>

      {priorities.isLoading ? <TableSkeleton rows={6} /> : null}

      {!priorities.isLoading && rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No district candidates for this selection."
            hint="This period, crop or geography combination has no published district rows. Try another period or clear the crop filter."
          />
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <RwandaDistrictMap
              data={map.data}
              metric={metric}
              onMetricChange={setMetric}
              selectedDistrict={activeDistrict}
              onSelectDistrict={setSelected}
              height={360}
              title="Priority map"
            />
            <DistrictRationale row={top} proxyNotes={proxyNotes} />
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title={`${activeDistrict} — crop priorities`}
              subtitle="Every published crop for this district, under the current weights and benchmark"
            />
            <div className="thin-scroll mt-3 overflow-auto">
              <ResponsiveTable
                columns={columns}
                rows={districtRows}
                rowKey={(row) => row.id}
                initialSort={{ id: "score", direction: "desc" }}
                caption={`Crop priorities for ${activeDistrict}: observed yield, benchmark, gap, score and band`}
              />
            </div>
            <SourceNote>
              Observed yield and benchmark are published NISR SAS district aggregates. A blank
              published cell stays blank — it is never imputed.
            </SourceNote>
          </Card>

          <ScoreComponentChart rows={districtRows} />
        </>
      ) : null}
    </div>
  );
}
