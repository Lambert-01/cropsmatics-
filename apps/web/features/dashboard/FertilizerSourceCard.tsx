"use client";

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
import { NationalContextBadge } from "@/components/ui/NationalContextBadge";
import { ChartSkeleton, EmptyState, ErrorState, UpdatingPill } from "@/components/ui/States";
import { AXIS_PROPS, CHART, TOOLTIP_STYLE } from "@/features/dashboard/chartTheme";
import { chartDisplayState, isUpdating as showUpdating } from "@/lib/chartState";
import { periodLabel } from "@/lib/format";
import type { FertilizerSourceResponse } from "@/types";

export function FertilizerSourceCard({
  data,
  isLoading,
  isFetching,
  hasError,
  errorMessage,
  onRetry,
}: {
  data?: FertilizerSourceResponse;
  isLoading?: boolean;
  isFetching?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const state = chartDisplayState({
    hasData: Boolean(data?.channels.length),
    isLoading,
    hasError,
  });
  const updating = showUpdating({ hasData: Boolean(data?.channels.length), isFetching });

  if (state === "loading") return <ChartSkeleton />;
  if (state === "error") {
    return (
      <Card>
        <CardHeader title="Fertilizer supply channels" subtitle="National planning context" />
        <div className="p-4">
          <ErrorState message={errorMessage} onRetry={onRetry} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Fertilizer supply channels"
        subtitle={
          data?.period_code
            ? `Mean reported share across ${data.n_fertilizer_types} fertilizer types · ${periodLabel(data.period_code)}`
            : "National planning context"
        }
        action={
          <div className="flex items-center gap-2">
            <NationalContextBadge note="national only" />
            <UpdatingPill active={updating} />
          </div>
        }
      />

      {data?.channels.length ? (
        <>
          <div className="px-4 pt-3">
            <p className="text-xs leading-relaxed text-slate-600">
              {data.dominant_channel ? (
                <>
                  <strong className="text-forest-deep">{data.dominant_channel}</strong> is the
                  largest reported channel in this period, at {data.dominant_share_pct?.toFixed(1)}%.
                </>
              ) : (
                "No dominant channel is available for this period."
              )}
            </p>
          </div>
          <div className="h-[235px] px-2 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.channels}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(value: number) => `${value}%`}
                  {...AXIS_PROPS}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={116}
                  tick={{ fill: CHART.axis, fontSize: 10 }}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, "Mean reported share"]}
                />
                <Bar dataKey="mean_share_pct" fill={CHART.primary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="p-4">
          <EmptyState
            title="No fertilizer-source data for this period."
            hint="Choose another published period. The dashboard will not substitute a different release silently."
          />
        </div>
      )}

      <SourceNote>
        {data?.note ?? "Published national fertilizer source shares."} Source: {data?.provenance.source_id ?? "NISR SAS fertilizer source tables"}.
        {data?.provenance.limitations?.[0] ? ` ${data.provenance.limitations[0]}.` : ""}
      </SourceNote>
    </Card>
  );
}
