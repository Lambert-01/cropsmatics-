"use client";

import { splitPeriod, type DashboardFilters } from "@/lib/filters";

import { ForecastPanel } from "../yield-intelligence/ForecastPanel";

export function PredictionsWorkspace({ filters }: { filters: DashboardFilters }) {
  const season = filters.view === "history" ? undefined : splitPeriod(filters.period).season ?? filters.season;
  const selection = [
    filters.crop ?? "All crops", season ? `Season ${season}` : "All seasons",
    filters.district ?? filters.province ?? "Rwanda",
  ].join(" / ");
  return (
    <section className="space-y-4" aria-labelledby="predictions-title">
      <div>
        <h2 id="predictions-title" className="text-base font-semibold text-forest-deep">Forecasts</h2>
        <p className="mt-1 text-sm text-slate-600">{selection}</p>
      </div>
      <ForecastPanel filters={filters} />
    </section>
  );
}
