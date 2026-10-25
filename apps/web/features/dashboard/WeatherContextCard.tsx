"use client";

import { CloudRain, Droplets, Thermometer, Wind } from "lucide-react";

import { Card, CardBody, CardHeader, SourceNote } from "@/components/ui/Card";
import { ChartSkeleton, ErrorState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { WeatherContextResponse } from "@/types";

function dayLabel(date: string, index: number): string {
  if (index === 0) return "Today";
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

export function WeatherContextCard({
  data,
  isLoading,
  error,
  onRetry,
}: {
  data?: WeatherContextResponse;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  if (isLoading) return <ChartSkeleton />;
  if (error) {
    return (
      <Card>
        <CardHeader title="Weather context" subtitle="External planning information" />
        <div className="p-4">
          <ErrorState message={error.message} onRetry={onRetry} />
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const current = data.current;
  return (
    <Card>
      <CardHeader
        title="Weather context"
        subtitle={`${data.location.district ?? "Selected location"} · next 3 days`}
      />
      <CardBody>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-forest/[0.04] p-3">
          <div>
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              <Thermometer className="h-3.5 w-3.5" aria-hidden="true" /> Temperature
            </p>
            <p className="mt-1 text-lg font-semibold text-forest-deep">
              {fmtNumber(current.temperature_c, 1)}°C
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" /> Rain
            </p>
            <p className="mt-1 text-lg font-semibold text-forest-deep">
              {fmtNumber(current.precipitation_mm, 1)} mm
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              <Wind className="h-3.5 w-3.5" aria-hidden="true" /> Wind
            </p>
            <p className="mt-1 text-lg font-semibold text-forest-deep">
              {fmtNumber(current.wind_speed_kmh, 1)} km/h
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {data.daily.map((day, index) => (
            <div key={day.date} className="rounded-lg border border-forest/10 p-2 text-xs">
              <p className="font-semibold text-forest-deep">{dayLabel(day.date, index)}</p>
              <p className="mt-1 text-slate-600">
                {fmtNumber(day.temperature_min_c, 0)}° / {fmtNumber(day.temperature_max_c, 0)}°C
              </p>
              <p className="mt-1 flex items-center gap-1 text-slate-500">
                <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                {fmtNumber(day.precipitation_probability_pct, 0)}% rain
              </p>
            </div>
          ))}
        </div>
        <SourceNote>
          {data.provider} · external weather context · {data.note}
        </SourceNote>
      </CardBody>
    </Card>
  );
}
