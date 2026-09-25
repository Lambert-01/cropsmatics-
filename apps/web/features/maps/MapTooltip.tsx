import { fmtNumber, periodLabel } from "@/lib/format";
import type { MapDistrictMetric } from "@/types";

export function MapTooltip({
  district,
  datum,
  metricLabel,
  unit,
  x,
  y,
  crop,
}: {
  district: string;
  datum?: MapDistrictMetric;
  metricLabel: string;
  unit?: string | null;
  x: number;
  y: number;
  crop?: string | null;
}) {
  const details = datum?.details ?? {};
  const show = (label: string, value: string | number | null | undefined) =>
    value === null || value === undefined ? null : (
      <div className="flex items-center justify-between gap-3">
        <dt className="text-white/60">{label}</dt>
        <dd className="font-medium text-white">{value}</dd>
      </div>
    );

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-30 w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-forest-deep/95 p-3 text-xs shadow-pop ring-1 ring-white/10 animate-fade-in"
      style={{ left: x, top: y - 8 }}
    >
      <p className="text-sm font-semibold text-white">{district}</p>
      {crop ? <p className="text-white/60">{crop}</p> : null}
      <dl className="mt-2 space-y-1">
        {show(
          metricLabel,
          datum?.value === null || datum?.value === undefined
            ? "no verified data"
            : `${fmtNumber(datum.value, 1)}${unit ? ` ${unit}` : ""}`,
        )}
        {show("Yield", details.yield_kg_ha != null ? `${fmtNumber(details.yield_kg_ha as number, 0)} kg/ha` : null)}
        {show("Benchmark", details.benchmark_yield_kg_ha != null ? `${fmtNumber(details.benchmark_yield_kg_ha as number, 0)} kg/ha` : null)}
        {show(
          "Productivity gap",
          details.gap_index != null ? `${fmtNumber(details.gap_index as number, 1)}%` : null,
        )}
        {show(
          "Input adoption",
          details.input_adoption_pct != null
            ? `${fmtNumber(details.input_adoption_pct as number, 1)}%`
            : null,
        )}
        {show("Priority band", details.priority_band as string | null)}
        {show("Period", periodLabel(details.period as string | null))}
      </dl>
    </div>
  );
}
