"use client";

import { useMemo } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, TableSkeleton } from "@/components/ui/States";
import { makeScale } from "@/features/maps/colors";
import { fmtNumber } from "@/lib/format";
import type { HeatmapResponse } from "@/types";

export function GapHeatmap({
  data,
  isLoading,
}: {
  data?: HeatmapResponse;
  isLoading?: boolean;
}) {
  const lookup = useMemo(() => {
    const map = new Map<string, number | null>();
    (data?.cells ?? []).forEach((c) => map.set(`${c.district}|${c.crop}`, c.value ?? null));
    return map;
  }, [data]);

  const scale = useMemo(
    () => makeScale(data?.min_value ?? 0, data?.max_value ?? 1, "worse"),
    [data],
  );

  if (isLoading) return <TableSkeleton rows={8} />;

  const crops = data?.crops ?? [];
  const districts = data?.districts ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Productivity gap heatmap"
        subtitle="District × crop median gap index — darker green is closer to benchmark, red is a larger gap"
      />
      {districts.length === 0 || crops.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <>
          <div className="thin-scroll mt-3 overflow-auto">
            <div
              className="grid min-w-max gap-0.5"
              style={{ gridTemplateColumns: `9rem repeat(${crops.length}, 2.4rem)` }}
            >
              <div />
              {crops.map((c) => (
                <div
                  key={c}
                  className="truncate pb-1 text-center text-[10px] font-medium text-slate-500"
                  style={{ writingMode: "vertical-rl", height: "6.5rem" }}
                  title={c}
                >
                  {c}
                </div>
              ))}
              {districts.map((d) => (
                <FragmentRow key={d} district={d} crops={crops} lookup={lookup} scale={scale} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-slate-500">
            <span>{fmtNumber(scale.min, 0)}%</span>
            <span
              className="h-2.5 w-40 rounded-full"
              style={{ background: `linear-gradient(to right, ${scale.stops.join(", ")})` }}
              aria-hidden="true"
            />
            <span>{fmtNumber(scale.max, 0)}%</span>
            <span className="ml-2">gap index (higher = further below benchmark)</span>
          </div>
        </>
      )}
      <SourceNote>
        Cells are median district × crop values computed by Python; blank cells have no verified
        observation for that selection.
      </SourceNote>
    </Card>
  );
}

function FragmentRow({
  district,
  crops,
  lookup,
  scale,
}: {
  district: string;
  crops: string[];
  lookup: Map<string, number | null>;
  scale: ReturnType<typeof makeScale>;
}) {
  return (
    <>
      <div className="truncate pr-2 text-xs text-slate-600" title={district}>
        {district}
      </div>
      {crops.map((crop) => {
        const value = lookup.get(`${district}|${crop}`);
        return (
          <div
            key={`${district}-${crop}`}
            className="h-8 rounded-sm"
            style={{ backgroundColor: scale.color(value ?? null) }}
            title={`${district} · ${crop}: ${
              value == null ? "no verified data" : `${fmtNumber(value, 1)}%`
            }`}
          />
        );
      })}
    </>
  );
}
