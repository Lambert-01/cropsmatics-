import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  MapPin,
  Package,
  Sprout,
  TrendingDown,
  Warehouse,
  Wheat,
} from "lucide-react";
import type { ReactNode } from "react";

import { KpiCard } from "@/components/ui/KpiCard";
import { periodLabel } from "@/lib/format";
import { pickKpisByIds, selectPrimaryKpis, selectSecondaryKpis } from "@/lib/kpis";
import type { KPI } from "@/types";

const ICONS: Record<string, ReactNode> = {
  avg_yield: <Sprout className="h-4 w-4" />,
  yield: <Sprout className="h-4 w-4" />,
  median_gap: <TrendingDown className="h-4 w-4" />,
  high_gap: <AlertTriangle className="h-4 w-4" />,
  crops: <Wheat className="h-4 w-4" />,
  districts: <MapPin className="h-4 w-4" />,
  input_adoption: <Sprout className="h-4 w-4" />,
  postharvest_loss: <Package className="h-4 w-4" />,
  total_production: <BarChart3 className="h-4 w-4" />,
  total_harvested_area: <Wheat className="h-4 w-4" />,
  storage_districts: <Warehouse className="h-4 w-4" />,
  national_production: <BarChart3 className="h-4 w-4" />,
  national_area: <Wheat className="h-4 w-4" />,
  national_yield: <Sprout className="h-4 w-4" />,
  national_seed: <Sprout className="h-4 w-4" />,
};

const ACCENTS: Record<string, "primary" | "amber" | "danger" | "info" | "success"> = {
  high_gap: "danger",
  median_gap: "amber",
  postharvest_loss: "amber",
  storage_districts: "info",
  total_production: "success",
  national_production: "success",
};

/** Lightweight card used for the secondary metrics disclosure. */
function MiniMetric({ kpi }: { kpi: KPI }) {
  const value =
    kpi.value === null || kpi.value === undefined
      ? "—"
      : `${kpi.value.toLocaleString("en-US", { maximumFractionDigits: 1 })}${
          kpi.unit === "%" ? "%" : ""
        }`;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-forest/5 py-1.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-700">{kpi.label}</p>
        <p className="text-[10px] text-slate-400">
          {kpi.unit && kpi.unit !== "%" ? `${kpi.unit} · ` : ""}
          {kpi.period_code ? periodLabel(kpi.period_code) : (kpi.period ?? "—")}
          {kpi.note ? ` · ${kpi.note}` : ""}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-forest-deep">{value}</p>
    </div>
  );
}

/**
 * The headline KPI strip.
 *
 * Hard product rule: at most four primary cards, and they must describe one
 * analytical scope and one period. Every other metric (including figures that
 * come from a different release, flagged ``scope: "context"``) is moved into a
 * collapsed "More metrics" disclosure rather than mixed into the headline row.
 */
export function DashboardKpis({
  kpis,
  primaryKpis,
  secondaryKpis,
  primaryIds,
}: {
  kpis: KPI[];
  primaryKpis?: KPI[];
  secondaryKpis?: KPI[];
  /**
   * When a page needs its own headline set it names the KPI ids explicitly, in
   * order. This is how "each page must explicitly define which KPI IDs are
   * important" is enforced rather than inferred from response order.
   */
  primaryIds?: string[];
}) {
  // ``slice(0, 4)`` is never used here: the primary set is either the page's
  // explicit ids or the API's explicit selection, capped at four so a context
  // figure cannot take a headline slot.
  const primary = primaryIds
    ? pickKpisByIds(kpis, primaryIds)
    : selectPrimaryKpis(kpis, primaryKpis);
  const secondary = selectSecondaryKpis(kpis, primary, secondaryKpis);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {primary.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            icon={ICONS[kpi.id]}
            accent={ACCENTS[kpi.id] ?? "primary"}
          />
        ))}
      </div>

      {secondary.length > 0 ? (
        <details className="card group px-4 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-slate-600 marker:content-none">
            <span>
              More metrics
              <span className="ml-1.5 font-normal text-slate-400">
                ({secondary.length}) — includes figures from other releases
              </span>
            </span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-1.5">
            {secondary.map((kpi) => (
              <MiniMetric key={kpi.id} kpi={kpi} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
