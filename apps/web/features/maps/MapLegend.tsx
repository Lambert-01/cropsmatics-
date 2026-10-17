import { NO_DATA_COLOR, scaleDirectionText, type ColorScale } from "@/features/maps/colors";

/**
 * The map legend.
 *
 * It is a control, not decoration, so it answers four different questions for
 * four different kinds of metric instead of drawing one gradient strip for all of
 * them:
 *
 * * a banded score lists its bands with their thresholds, and says the score is
 *   not a probability;
 * * a quantity gets a sequential bar whose endpoints are the published ones;
 * * a signed gap gets a diverging bar with zero marked as the benchmark;
 * * a scope where every district shares one value says so, rather than drawing a
 *   span between two equal endpoints.
 *
 * Two rules hold in every branch: the swatch for a district with no published
 * value is the same colour the map paints it, taken from one exported constant,
 * and a range that was never published is reported as absent - "0 -> 1" would be a
 * span nobody published. The meaning of the scale is always stated in words, so
 * colour is never the only carrier.
 */
export function MapLegend({
  scale,
  unit,
  higherIs,
  direction,
  note,
  noDataLabel = "No verified data",
  overlay,
}: {
  scale: ColorScale;
  unit?: string | null;
  higherIs: "better" | "worse" | "neutral";
  /** Overrides the derived direction text; pass the metric's own wording. */
  direction?: string | null;
  note?: string;
  noDataLabel?: string;
  /** Entry for the yield-shortfall hatch, shown only while the hatch is drawn. */
  overlay?: string | null;
}) {
  const gradient = `linear-gradient(to right, ${scale.stops.join(", ")})`;
  const format = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
  const fallback =
    higherIs === "worse"
      ? "higher = larger gap"
      : higherIs === "better"
        ? "higher = better"
        : "";
  // The metric's own wording wins; the direction word is the fallback for callers
  // that predate it, and the scale's own kind is the last resort.
  const reading = direction || fallback || scaleDirectionText(scale);
  const suffix = unit ? ` (${unit})` : "";

  return (
    <div className="border-t border-forest/10 px-4 py-3">
      {scale.kind === "bands" ? (
        <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {scale.bands.map((band) => (
            <span key={band.band} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-3 rounded-sm"
                style={{ background: band.color }}
                aria-hidden="true"
              />
              <span className="font-medium">
                {band.band.charAt(0) + band.band.slice(1).toLowerCase()}
              </span>
              <span className="text-slate-400">≥ {band.min}</span>
            </span>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {unit ? `${unit} · ` : ""}
          {reading}
        </p>
        </>
      ) : scale.published && scale.flat ? (
        <p className="text-[11px] font-medium text-slate-600">
          One published value for this selection: {format(scale.min)}
          {suffix}. There is no spread to colour.
        </p>
      ) : scale.published ? (
        <>
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
            <span>{format(scale.min)}</span>
            <span className="uppercase tracking-wide text-slate-400">
              {unit ?? ""} {reading}
            </span>
            <span>{format(scale.max)}</span>
          </div>
          <div className="mt-1 h-2.5 w-full rounded-full" style={{ background: gradient }} />
          {scale.kind === "diverging" && scale.min <= 0 && scale.max >= 0 ? (
            <p className="mt-1 text-[11px] text-slate-500">
              0 is the benchmark, not a missing value.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-[11px] font-medium text-slate-600">
          No published range for this selection{suffix}
          {reading ? ` ${reading}` : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {overlay ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-3 rounded-sm"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #032D23 0 1.5px, transparent 1.5px 4px)",
              }}
              aria-hidden="true"
            />
            {overlay}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3 rounded-sm"
            style={{ background: NO_DATA_COLOR }}
            aria-hidden="true"
          />
          {noDataLabel}
        </span>
        {note ? <span className="truncate">{note}</span> : null}
      </div>
    </div>
  );
}
