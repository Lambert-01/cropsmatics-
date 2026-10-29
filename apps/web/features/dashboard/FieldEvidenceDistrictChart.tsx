"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, EmptyState, ErrorState, UpdatingPill } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { fmtNumber } from "@/lib/format";
import type { DashboardFilters } from "@/lib/filters";
import type { FieldObservationsResponse } from "@/types";

type EvidenceMetric = "crop_count" | "plot_crop_records" | "area_ha" | "production_kg";

const METRICS: { id: EvidenceMetric; label: string; unit: string }[] = [
  { id: "crop_count", label: "Crops represented", unit: "crops" },
  { id: "plot_crop_records", label: "Sample plots", unit: "records" },
  { id: "area_ha", label: "Area represented", unit: "ha" },
  { id: "production_kg", label: "Production represented", unit: "kg" },
];

export function FieldEvidenceDistrictChart({
  data,
  filters,
  isLoading,
  isFetching,
  isError,
  onRetry,
  onSelectDistrict,
  districtData,
  districtDataLoading,
  districtDataFetching,
  districtDataError,
  onDistrictDataRetry,
}: {
  data?: FieldObservationsResponse;
  filters: DashboardFilters;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectDistrict: (district: string) => void;
  districtData?: FieldObservationsResponse;
  districtDataLoading: boolean;
  districtDataFetching: boolean;
  districtDataError: boolean;
  onDistrictDataRetry: () => void;
}) {
  const [metric, setMetric] = useState<EvidenceMetric>(filters.crop ? "plot_crop_records" : "crop_count");

  useEffect(() => {
    setMetric(filters.crop ? "plot_crop_records" : "crop_count");
  }, [filters.crop]);

  const selectedMetric = METRICS.find((option) => option.id === metric) ?? METRICS[0];
  const hasCurrentScope = Boolean(
    data?.rows.some(
      (row) =>
        (!filters.district || row.district === filters.district) &&
        (!filters.crop || row.crop === filters.crop),
    ),
  );
  const scopedData = hasCurrentScope ? data : undefined;
  const rows = useMemo(() => {
    return (scopedData?.district_summaries ?? [])
      .filter((row) => typeof row[metric] === "number" && Number.isFinite(row[metric] as number))
      .map((row) => ({
        ...row,
        label: row.district ?? "Unknown district",
        value: row[metric] as number,
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 12);
  }, [scopedData?.district_summaries, metric]);
  const hasCurrentDistrict = Boolean(
    filters.district && districtData?.rows.some((row) => row.district === filters.district),
  );
  const currentDistrictData = hasCurrentDistrict ? districtData : undefined;
  const districtCrops = currentDistrictData?.crop_summaries ?? [];
  const largestCropSample = Math.max(
    ...districtCrops.map((crop) => crop.plot_crop_records),
    0,
  );

  if (isLoading && !data) return <ChartSkeleton />;
  if (isError && !data) {
    return (
      <Card>
        <CardHeader title="District field sample" subtitle="Filtered NISR/AHS evidence" />
        <div className="p-4">
          <ErrorState message="District field evidence could not be loaded." onRetry={onRetry} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={filters.crop ? `${filters.crop} field sample by district` : "Field evidence by district"}
        subtitle="Choose a district to inspect every crop in its sample"
        action={<UpdatingPill active={isFetching && Boolean(data)} />}
      />
      <div className="flex flex-wrap items-center gap-1 px-4 pt-3" role="group" aria-label="Field evidence chart metric">
        {METRICS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMetric(option.id)}
            aria-pressed={metric === option.id}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
              metric === option.id
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-primary/10 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {scopedData?.available && scopedData.rows.length > 0 ? (
        <>
          <div className="grid gap-2 px-4 pt-3 sm:grid-cols-3">
            <SummaryStat label="Plot-crop records" value={fmtNumber(scopedData.n_plot_records)} />
            <SummaryStat label="Area represented" value={`${fmtNumber(scopedData.area_ha_total, 1)} ha`} />
            <SummaryStat label="Production represented" value={`${fmtNumber(scopedData.production_kg_total, 0)} kg`} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-3 text-xs text-slate-500 dark:text-slate-300">
            <span>Sample periods: {scopedData.available_periods.join(", ") || "not published"}</span>
            <span>{scopedData.count} district/crop rows in this scope</span>
            <span>{scopedData.geometry_available ? `${fmtNumber(scopedData.n_records_with_geometry)} geometries` : "Exact boundaries not supplied"}</span>
          </div>
        </>
      ) : null}
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No field sample matches these filters"
            hint={`Choose a published sample period or crop. Available sample periods: ${data?.available_periods?.join(", ") || "none"}.`}
          />
        </div>
      ) : (
        <div className="h-[320px] px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 22, bottom: 8, left: 8 }}
              onClick={(state) => {
                const district = (state as { activePayload?: Array<{ payload?: { district?: string | null } }> })
                  .activePayload?.[0]?.payload?.district;
                if (district) onSelectDistrict(district);
              }}
            >
              <CartesianGrid stroke={CHART.grid} horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value: number) => fmtNumber(value, 0)}
                {...AXIS_PROPS}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={92}
                tick={{ fill: CHART.axis, fontSize: 10 }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value) => [
                  `${fmtNumber(Number(value), metric === "area_ha" ? 1 : 0)} ${selectedMetric.unit}`,
                  selectedMetric.label,
                ]}
                labelFormatter={(label) => String(label)}
              />
              <Bar
                dataKey="value"
                name={selectedMetric.label}
                fill={CHART.primary}
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                cursor="pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="border-t border-forest/10 px-4 py-4 dark:border-white/10">
        {filters.district ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-forest-deep dark:text-white">
                  Crops represented in {filters.district}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
                  All crops in the selected district sample
                </p>
              </div>
              {districtDataFetching && currentDistrictData ? <UpdatingPill active /> : null}
            </div>
            {districtDataError && !currentDistrictData ? (
              <div className="mt-3">
                <ErrorState
                  message="The crop details for this district could not be loaded."
                  onRetry={onDistrictDataRetry}
                />
              </div>
            ) : districtDataLoading && !currentDistrictData ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Loading crop details">
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            ) : districtCrops.length ? (
              <div className="mt-3 grid max-h-[390px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {districtCrops.map((crop) => {
                  const cropName = crop.crop ?? "Unresolved crop";
                  const width = largestCropSample
                    ? Math.max(7, (crop.plot_crop_records / largestCropSample) * 100)
                    : 0;
                  return (
                    <div
                      key={cropName}
                      className="rounded-lg border border-forest/10 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-slate-900/70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-forest-deep dark:text-white">
                          {cropName}
                        </p>
                        <span className="shrink-0 text-[11px] font-semibold text-primary dark:text-emerald-300">
                          {fmtNumber(crop.plot_crop_records)} plots
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-forest/10 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-primary dark:bg-emerald-300"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-200">
                        <span>{fmtNumber(crop.area_ha, 1)} ha</span>
                        <span>{fmtNumber(crop.production_kg, 0)} kg</span>
                        <span>{crop.periods.join(", ")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  title="No crop sample matches this district"
                  hint="The list only includes approved sample observations; crops are not inferred from district boundaries."
                />
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-200">
              Values are privacy-safe district/crop sample aggregates, not national estimates. Exact field boundaries are not supplied.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-forest/15 bg-slate-50/70 px-3 py-3 dark:border-white/15 dark:bg-slate-900/50">
            <p className="text-xs font-semibold text-forest-deep dark:text-white">Select a district</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-200">
              Click a bar or use the District filter above to see every crop represented in that district.
            </p>
          </div>
        )}
      </div>
      <SourceNote>
        Python aggregates the approved sample after the current year, season, crop, province and district filters.
        {filters.crop ? ` ${filters.crop} is selected.` : " Select a crop to compare its sample across districts."}
        {" "}These are sample records, not national estimates; exact field boundaries are not supplied.
      </SourceNote>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-forest/10 bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-300">{label}</p>
      <p className="mt-1 font-semibold text-forest dark:text-white">{value}</p>
    </div>
  );
}
