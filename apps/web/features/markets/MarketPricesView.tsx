"use client";

import { Info, LineChart } from "lucide-react";
import { useState } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import { useMarketDispersion, useMarketLatest, useMarketTrend } from "@/services/hooks/useMarkets";
import type { MarketObservation } from "@/types";

const VALUE_COLUMN = "price_rwf_per_kg";

/**
 * Describe one observation as a price, always with its type, market and date.
 * A bare number would be ambiguous the moment two price types are on the page.
 */
function describe(row: MarketObservation): string {
  const parts = [row.commodity_name_raw, row.market_name, row.district].filter(Boolean);
  return parts.join(" · ");
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-forest-deep">{value}</dd>
    </div>
  );
}

/**
 * Market prices, shown only once verified observations exist.
 *
 * Every figure keeps its price type. The headline names the exact observation it
 * came from rather than presenting an average, and each series and range is
 * returned per type, so farmgate and retail can never be read as one price.
 */
export function MarketPricesView({ commodities }: { commodities: string[] }) {
  const [commodity, setCommodity] = useState(commodities[0] ?? "");

  const latest = useMarketLatest(true, {});
  const trend = useMarketTrend(commodity || undefined);
  const dispersion = useMarketDispersion(commodity || undefined);

  const headline =
    latest.data?.rows.find((row) => row.commodity_name_raw === commodity) ?? latest.data?.rows[0];

  if (!commodities.length) {
    return (
      <Card>
        <EmptyState
          title="No commodity has a verified observation yet."
          hint="Market Intelligence lists a commodity only once a real, attributable price observation exists for it."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Latest observed price
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-forest-deep">
            {fmtNumber(headline?.[VALUE_COLUMN] ?? null, 0)}
            <span className="ml-1 text-xs font-normal text-slate-500">RWF/kg</span>
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {headline?.price_type ? `${headline.price_type} · ` : ""}
            {headline ? describe(headline) : "—"}
          </p>
          {headline?.observation_date ? (
            <p className="text-[10px] text-slate-400">observed {headline.observation_date}</p>
          ) : null}
        </Card>

        <Card className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Price types observed
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-forest-deep">
            {dispersion.data?.groups.length ?? 0}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {dispersion.data?.groups.map((group) => group.price_type).join(", ") || "—"}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Reporting markets
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-forest-deep">
            {Math.max(0, ...(dispersion.data?.groups.map((group) => group.markets) ?? [0]))}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">in the widest observed group</p>
        </Card>

        <Card className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Observations
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-forest-deep">
            {trend.data?.series.reduce((sum, item) => sum + item.n_observations, 0) ?? 0}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">for {commodity || "—"}</p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Commodity"
          subtitle="Only commodities with a verified observation are listed"
        />
        <div className="px-4 pb-3 pt-3">
          <select
            className="input w-full sm:w-72"
            value={commodity}
            onChange={(event) => setCommodity(event.target.value)}
          >
            {commodities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Observed range by price type"
          subtitle="Each type is measured on its own observations"
        />
        <div className="flex items-start gap-2 px-4 pt-2 text-[11px] text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
          <span>
            A spread is only meaningful inside one price type. Averaging farmgate with retail would
            produce a number that describes no market.
          </span>
        </div>

        {dispersion.isError ? (
          <div className="p-4">
            <ErrorState
              message={(dispersion.error as Error).message}
              onRetry={() => dispersion.refetch()}
            />
          </div>
        ) : !dispersion.data?.groups.length ? (
          <div className="p-4">
            <EmptyState
              title="No dispersion could be computed for this commodity."
              hint="This needs at least one observation with a normalised price."
            />
          </div>
        ) : (
          <div className="overflow-x-auto px-4 pb-3 pt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 pr-3">Price type</th>
                  <th className="py-1.5 pr-3 text-right">Min</th>
                  <th className="py-1.5 pr-3 text-right">Median</th>
                  <th className="py-1.5 pr-3 text-right">Max</th>
                  <th className="py-1.5 pr-3 text-right">Range</th>
                  <th className="py-1.5 pr-3 text-right">Markets</th>
                  <th className="py-1.5 text-right">N</th>
                </tr>
              </thead>
              <tbody>
                {dispersion.data.groups.map((group) => (
                  <tr key={group.price_type} className="border-t border-forest/5">
                    <td className="py-1.5 pr-3 font-medium text-slate-700">{group.price_type}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtNumber(group.minimum, 0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtNumber(group.median, 0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtNumber(group.maximum, 0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtNumber(group.range, 0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{group.markets}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-400">
                      {group.n_observations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <SourceNote>
          Values in RWF per kg, converted from the published currency and unit. The original value,
          currency and unit are retained on every observation.
        </SourceNote>
      </Card>

      {(trend.data?.series ?? []).map((series) => (
        <Card key={series.price_type}>
          <CardHeader
            title={`Observed price — ${series.price_type}`}
            subtitle={`${series.n_observations} observation${series.n_observations === 1 ? "" : "s"} · ${series.unit}`}
          />
          {series.points.length ? (
            <div className="overflow-x-auto px-4 pb-3 pt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-3">Date</th>
                    <th className="py-1.5 text-right">Price (RWF/kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {series.points.map((point) => (
                    <tr key={point.date} className="border-t border-forest/5">
                      <td className="py-1.5 pr-3 text-slate-600">{point.date}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-forest-deep">
                        {fmtNumber(point.value, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No dated observation for this price type." />
            </div>
          )}
          <SourceNote>
            <span className="inline-flex items-center gap-1.5">
              <LineChart className="h-3 w-3" aria-hidden="true" />
              One series per price type. The median of same-day, same-type observations is shown so
              several markets on one day stay comparable.
            </span>
          </SourceNote>
        </Card>
      ))}
    </div>
  );
}
