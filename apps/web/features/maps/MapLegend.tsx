import type { ColorScale } from "@/features/maps/colors";

export function MapLegend({
  scale,
  unit,
  higherIs,
  note,
  noDataLabel = "No verified data",
}: {
  scale: ColorScale;
  unit?: string | null;
  higherIs: "better" | "worse" | "neutral";
  note?: string;
  noDataLabel?: string;
}) {
  const gradient = `linear-gradient(to right, ${scale.stops.join(", ")})`;
  const format = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

  return (
    <div className="border-t border-forest/10 px-4 py-3">
      <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
        <span>{format(scale.min)}</span>
        <span className="uppercase tracking-wide text-slate-400">
          {unit ? unit : ""} {higherIs === "worse" ? "· higher = larger gap" : higherIs === "better" ? "· higher = better" : ""}
        </span>
        <span>{format(scale.max)}</span>
      </div>
      <div className="mt-1 h-2.5 w-full rounded-full" style={{ background: gradient }} />
      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm bg-[#e2e8f0]" aria-hidden="true" />
          {noDataLabel}
        </span>
        {note ? <span className="truncate">{note}</span> : null}
      </div>
    </div>
  );
}
