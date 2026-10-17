import { fmtNumber, periodLabel } from "@/lib/format";
import type { FacilityItem, MapDistrictMetric } from "@/types";

/**
 * District hover card for the Rwanda choropleth.
 *
 * The surface and all four text roles come from the `--tooltip-*` tokens in
 * `app/globals.css`, never from raw `white`/`forest-deep`. Those brand tokens
 * invert between themes, so pairing `bg-forest-deep` with `text-white` produced
 * white-on-white in dark mode (the background became near-white while the text
 * stayed forced white). The district name is bold and leads the card so the
 * reader can identify the district before the metrics.
 */
export function MapTooltip({
  district,
  datum,
  metricLabel,
  unit,
  x,
  y,
  crop,
  facility,
}: {
  district: string;
  datum?: MapDistrictMetric;
  metricLabel: string;
  unit?: string | null;
  x: number;
  y: number;
  crop?: string | null;
  facility?: FacilityItem;
}) {
  const details = datum?.details ?? {};
  const show = (label: string, value: string | number | null | undefined) =>
    value === null || value === undefined ? null : (
      <div className="flex items-center justify-between gap-3">
        <dt className="map-tooltip-key">{label}</dt>
        <dd className="map-tooltip-value tabular-nums">{value}</dd>
      </div>
    );

  return (
    <div
      role="tooltip"
      className="map-tooltip pointer-events-none absolute z-30 w-56 -translate-x-1/2 -translate-y-full rounded-lg p-3 text-xs animate-fade-in"
      style={{ left: x, top: y - 8 }}
    >
      <p className="map-tooltip-title">{district}</p>
      {crop ? <p className="map-tooltip-key">{crop}</p> : null}
      <hr className="map-tooltip-divider my-2 border-t" />
      <dl className="space-y-1">
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
        {/* Eligibility is a separate fact from the score: a district whose crops are
            all at or above their benchmark is not eligible for productivity support,
            and that reason is stated here rather than implied by a low band. */}
        {show(
          "Productivity support",
          details.eligible === true
            ? "Eligible"
            : details.eligible === false
              ? "Not eligible"
              : null,
        )}
        {show("Why not", details.eligibility_reason as string | null)}
        {show(
          "Crops eligible",
          details.n_eligible != null
            ? `${details.n_eligible} of ${Number(details.n_eligible) + Number(details.n_excluded ?? 0)}`
            : null,
        )}
        {show("Period", periodLabel(details.period as string | null))}
        {facility ? show("Program", facility.initiative ?? "Cold-chain context") : null}
        {facility ? show("Capacity", "Not verified") : null}
        {facility ? show("Location", "District context only") : null}
        {facility ? show("Source", facility.source_id ?? "MINAGRI") : null}
      </dl>
    </div>
  );
}
