/**
 * Scales for the choropleth and the ranked-gap charts.
 *
 * The palette follows what a metric *means*, not one house gradient applied to
 * everything:
 *
 * * a quantity (production, harvested area, adoption shares) uses a single-hue
 *   sequential ramp, because "larger" is not "worse";
 * * a signed value with a real zero (the productivity gap, where zero *is* the
 *   benchmark) uses a diverging ramp centred on that zero, over the wider of the
 *   two sides so the neutral stop is genuinely at zero;
 * * a binned score (intervention priority) uses discrete band fills, because a
 *   continuous gradient implies a precision the score does not have.
 *
 * Two rules hold for every scale here: a value that was never published is drawn
 * with one shared no-data colour and never as zero, and the scale reports whether
 * the API published a range at all, so a legend cannot print endpoints nobody
 * published.
 */

import {
  PRIORITY_BAND_FILL,
  PRIORITY_BAND_STOPS,
  bandForScore,
  type MapScaleKind,
} from "@/lib/constants";

/** Legacy direction words still used by charts outside the map. */
export type ScaleDirection = "better" | "worse" | "neutral";

/** What `makeScale` accepts: either a scale kind or a direction word. */
export type ScaleMode = MapScaleKind | ScaleDirection;

/** Light -> dark single hue: "more of this" -> "even more of this". */
const SEQUENTIAL = ["#f0fdf4", "#bbf7d0", "#86efac", "#4ade80", "#16a34a"];

const DIVERGING_LOW = ["#15803d", "#86efac", "#fef9c3"]; // most below -> zero
const DIVERGING_HIGH = ["#fef9c3", "#fca5a5", "#b91c1c"]; // zero -> most above

/**
 * The fill for a district with no published value for the selected metric.
 *
 * Exported rather than repeated: the legend swatch and the map fill have to be the
 * same colour, and two hardcoded copies of one hex value drift apart the first
 * time either is touched.
 */
export const NO_DATA_COLOR = "#e2e8f0";

export interface ScaleBand {
  band: string;
  min: number;
  color: string;
}

export interface ColorScale {
  /** Which treatment this scale renders, so the legend can pick a control. */
  kind: MapScaleKind;
  /** Gradient stops for the legend bar. Empty for a band scale. */
  stops: string[];
  color: (value: number | null | undefined) => string;
  min: number;
  max: number;
  /**
   * Whether the API published a range for this layer.
   *
   * The service reports `min_value`/`max_value` as `null` when the metric has no
   * published value for the selection. Colouring still needs a span to interpolate
   * over, but the legend must not print an endpoint it was never given: "0 -> 1" is
   * a range nobody published.
   */
  published: boolean;
  /**
   * Whether every published value is the same number.
   *
   * A scope with one value has no measured range: the legend says so rather than
   * drawing a span between two equal endpoints.
   */
  flat: boolean;
  /** True when zero is within the published span (so zero is real, not missing). */
  hasZero: boolean;
  /** Band definitions, for a band scale; empty otherwise. */
  bands: ScaleBand[];
  /** Fill for a band, preferring the API's own label and only then the score. */
  colorForBand: (band: string | null | undefined, score?: number | null) => string;
}

const NO_BANDS: ScaleBand[] = [];

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r} ${g} ${bl})`;
}

function ramp(stops: string[], t: number): string {
  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[i], stops[i + 1], scaled - i);
}

function bandScale(): ColorScale {
  const bands = PRIORITY_BAND_STOPS.map((stop) => ({
    ...stop,
    color: PRIORITY_BAND_FILL[stop.band] ?? NO_DATA_COLOR,
  }));
  return {
    kind: "bands",
    stops: [],
    min: 0,
    max: 1,
    published: true,
    flat: false,
    hasZero: false,
    bands,
    // The API's own band label wins when it labelled the row; a score without a
    // band is placed with the published thresholds. A row with neither (no score
    // for this purpose) gets the no-data fill rather than a coloured band.
    colorForBand: (band, score) => {
      const code = (band ?? "").toUpperCase();
      if (code && PRIORITY_BAND_FILL[code]) return PRIORITY_BAND_FILL[code];
      if (typeof score === "number" && Number.isFinite(score)) {
        return PRIORITY_BAND_FILL[bandForScore(score)] ?? NO_DATA_COLOR;
      }
      return NO_DATA_COLOR;
    },
    color: (value) => {
      if (typeof value !== "number" || Number.isNaN(value)) return NO_DATA_COLOR;
      return PRIORITY_BAND_FILL[bandForScore(value)] ?? NO_DATA_COLOR;
    },
  };
}

/**
 * Build a scale for a published range.
 *
 * `mode` accepts either a scale kind from `METRIC_SEMANTICS` or the legacy
 * direction word ("better" / "worse") that the ranked-gap charts still pass;
 * a direction word is mapped to the sequential ramp in the matching direction.
 */
export function makeScale(
  min: number | null | undefined,
  max: number | null | undefined,
  mode: ScaleMode = "sequential",
  values: (number | null | undefined)[] = [],
): ColorScale {
  const kind: MapScaleKind =
    mode === "better"
      ? "sequential_reversed"
      : mode === "worse" || mode === "neutral"
        ? "sequential"
        : mode;

  if (kind === "bands") return bandScale();

  const published = typeof min === "number" && typeof max === "number";
  const rawMin = published ? (min as number) : 0;
  const rawMax = published ? (max as number) : rawMin + 1;
  const safeMin = Math.min(rawMin, rawMax);
  const safeMax = Math.max(rawMin, rawMax);
  const numeric = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const flat = published && safeMin === safeMax;
  const hasZero = numeric.some((value) => value === 0);

  const stops =
    kind === "diverging"
      ? [...DIVERGING_LOW, ...DIVERGING_HIGH.slice(1)]
      : kind === "sequential_reversed"
        ? [...SEQUENTIAL].reverse()
        : SEQUENTIAL;

  const color = (value: number | null | undefined): string => {
    if (typeof value !== "number" || Number.isNaN(value)) return NO_DATA_COLOR;
    if (kind !== "diverging") {
      if (safeMax === safeMin) return ramp(stops, 0.5);
      return ramp(stops, (value - safeMin) / (safeMax - safeMin));
    }
    // Diverging: zero must sit at the neutral stop, not at the arithmetic middle
    // of the range. A gap of +5% and a gap of -5% are equally far from the
    // benchmark, so each side is interpolated against its own span - which is also
    // what makes a one-sided domain (every district below benchmark) read honestly
    // as "all on the below side" instead of a half-used palette.
    if (value === 0) return DIVERGING_LOW[DIVERGING_LOW.length - 1];
    if (value < 0) {
      const span = safeMin >= 0 ? value : -safeMin;
      return ramp(DIVERGING_LOW, span ? Math.max(0, Math.min(1, value / span)) : 0);
    }
    const span = safeMax <= 0 ? value : safeMax;
    return ramp(DIVERGING_HIGH, span ? Math.max(0, Math.min(1, value / span)) : 0);
  };

  return {
    kind,
    stops,
    color,
    min: safeMin,
    max: safeMax,
    published,
    flat,
    hasZero,
    bands: NO_BANDS,
    colorForBand: () => NO_DATA_COLOR,
  };
}

/** Plain-language reading of a scale's direction, for a legend caption. */
export function scaleDirectionText(scale: ColorScale, direction?: string | null): string {
  if (direction) return direction;
  if (scale.kind === "diverging") return "green = at or above benchmark · red = further below";
  if (scale.kind === "sequential_reversed") return "darker = higher value";
  if (scale.kind === "bands") return "shaded band = planning score band, not a probability";
  return "darker = larger value";
}
