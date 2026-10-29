"use client";

import { Sprout } from "lucide-react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton, UpdatingPill } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { FieldObservationsResponse } from "@/types";

export function DistrictCropEvidencePanel({
  district,
  data,
  isLoading,
  isFetching,
  isError,
  onRetry,
}: {
  district?: string | null;
  data?: FieldObservationsResponse;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isError && !data) {
    return (
      <Card>
        <CardHeader title="District crop evidence" subtitle="Filtered NISR/AHS sample" />
        <div className="p-4">
          <ErrorState message="The district crop sample could not be loaded." onRetry={onRetry} />
        </div>
      </Card>
    );
  }
  const hasCurrentDistrict = Boolean(
    district && data?.rows.some((row) => row.district === district),
  );
  const currentData = hasCurrentDistrict ? data : undefined;

  if (isLoading || (isFetching && Boolean(district) && !currentData)) return <TableSkeleton rows={6} />;

  const crops = currentData?.crop_summaries ?? [];
  const largestSample = Math.max(...crops.map((crop) => crop.plot_crop_records), 0);

  return (
    <Card className="min-h-full overflow-hidden">
      <CardHeader
        title={district ? `Crops represented in ${district}` : "District crop evidence"}
        subtitle={
          district
            ? "All crops in the selected district sample"
            : "Click a district on the map to inspect its crops"
        }
        action={
          <div className="flex items-center gap-2">
            <UpdatingPill active={isFetching && Boolean(currentData)} />
            <Sprout className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
        }
      />
      {!district ? (
        <div className="p-4">
          <EmptyState
            title="Select a district"
            hint="Click a district boundary in the map to see every crop represented in its approved sample."
          />
        </div>
      ) : crops.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No crop sample matches this district"
            hint={`${currentData?.message ?? "No approved field evidence is available for this selection."} The crop list is not inferred from the district boundary.`}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-3 text-xs text-slate-500 dark:text-slate-300">
            <span>{crops.length} crops represented</span>
            <span>{currentData?.available_periods?.join(", ")}</span>
          </div>
          <div className="max-h-[390px] space-y-2 overflow-y-auto px-4 py-3">
            {crops.map((crop) => {
              const cropName = crop.crop ?? "Unresolved crop";
              const width = largestSample
                ? Math.max(7, (crop.plot_crop_records / largestSample) * 100)
                : 0;
              return (
                <div
                  key={cropName}
                  className="rounded-lg border border-forest/10 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-semibold text-forest-deep dark:text-white">{cropName}</p>
                    <span className="shrink-0 text-[11px] font-semibold text-primary">
                      {fmtNumber(crop.plot_crop_records)} sample plots
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-forest/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-300">
                    <span>{fmtNumber(crop.area_ha, 1)} ha</span>
                    <span>{fmtNumber(crop.production_kg, 0)} kg</span>
                    <span>{crop.periods.join(", ")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <SourceNote>
        Values are privacy-safe district/crop sample aggregates, not national estimates. Exact field boundaries are not supplied.
      </SourceNote>
    </Card>
  );
}
