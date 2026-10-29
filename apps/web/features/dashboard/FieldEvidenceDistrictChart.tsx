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
}: {
  data?: FieldObservationsResponse;
  filters: DashboardFilters;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectDistrict: (district: string) => void;
}) {
  const [metric, setMetric] = useState<EvidenceMetric>(filters.crop ? "plot_crop_records" : "crop_count");

  useEffect(() => {
    setMetric(filters.crop ? "plot_crop_records" : "crop_count");
  }, [filters.crop]);

  const selectedMetric = METRICS.find((option) => option.id === metric) ?? METRICS[0];
  const rows = useMemo(() => {
    return (data?.district_summaries ?? [])
      .filter((row) => typeof row[metric] === "number" && Number.isFinite(row[metric] as number))
      .map((row) => ({
        ...row,
        label: row.district ?? "Unknown district",
        value: row[metric] as number,
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 12);
  }, [data?.district_summaries, metric]);

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
        subtitle="Click a bar to apply that district filter"
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
      {data?.available && data.rows.length > 0 ? (
        <>
          <div className="grid gap-2 px-4 pt-3 sm:grid-cols-3">
            <SummaryStat label="Plot-crop records" value={fmtNumber(data.n_plot_records)} />
            <SummaryStat label="Area represented" value={`${fmtNumber(data.area_ha_total, 1)} ha`} />
            <SummaryStat label="Production represented" value={`${fmtNumber(data.production_kg_total, 0)} kg`} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-3 text-xs text-slate-500 dark:text-slate-300">
            <span>Sample periods: {data.available_periods.join(", ") || "not published"}</span>
            <span>{data.count} district/crop rows in this scope</span>
            <span>{data.geometry_available ? `${fmtNumber(data.n_records_with_geometry)} geometries` : "Exact boundaries not supplied"}</span>
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
      <SourceNote>
        Python aggregates the approved sample after the current period, crop, province and district filters.
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
