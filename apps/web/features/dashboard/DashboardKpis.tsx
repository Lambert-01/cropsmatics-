import {
  AlertTriangle,
  BarChart3,
  MapPin,
  Package,
  Sprout,
  TrendingDown,
  Warehouse,
  Wheat,
} from "lucide-react";
import type { ReactNode } from "react";

import { KpiCard } from "@/components/ui/KpiCard";
import type { KPI } from "@/types";

const ICONS: Record<string, ReactNode> = {
  avg_yield: <Sprout className="h-4 w-4" />,
  median_gap: <TrendingDown className="h-4 w-4" />,
  high_gap: <AlertTriangle className="h-4 w-4" />,
  crops: <Wheat className="h-4 w-4" />,
  districts: <MapPin className="h-4 w-4" />,
  input_adoption: <Sprout className="h-4 w-4" />,
  postharvest_loss: <Package className="h-4 w-4" />,
  total_production: <BarChart3 className="h-4 w-4" />,
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
};

export function DashboardKpis({ kpis }: { kpis: KPI[] }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${kpis.length <= 4 ? "xl:grid-cols-4" : kpis.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-6"}`}>
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.id}
          kpi={kpi}
          icon={ICONS[kpi.id]}
          accent={ACCENTS[kpi.id] ?? "primary"}
        />
      ))}
    </div>
  );
}
