/**
 * Choropleth class breaks and per-metric colour scales.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **A legend must describe the classification the map actually used.** The
 *    previous implementation printed `cuts[index - 1]` and fell back to `0` for
 *    the first band, so every boundary below the second class was wrong. The
 *    bounds are derived here from the same cuts that colour the shapes, so the
 *    two cannot drift.
 * 2. **Colour must not flatter a bad number.** A larger productivity gap is a
 *    worse result; painting it deeper green reads as an improvement. Burden
 *    metrics therefore use a warm scale that darkens towards red, and positive
 *    magnitude metrics keep the forest green ramp.
 *
 * All of this is pure so it is unit-testable without a renderer.
 */

import { colors } from "../theme";
import type { MapLayer } from "./coverage";

/** Higher value is a better outcome, or a neutral magnitude. Light -> deep. */
export const SCALE_POSITIVE = ["#DDF5EB", "#A7E3C9", "#5FC4A0", "#1E9A73", "#056A4A"] as const;

/** Higher value is worse (a burden). Light amber -> deep red. Never green. */
export const SCALE_BURDEN = ["#FFF3D6", "#F5C877", "#E79A3C", "#D2662A", "#A8201A"] as const;

/** Reserved for "no verified value". Never part of either ramp. */
export const NO_DATA_COLOR = colors.missing;

export type ScaleDirection = "higherIsBetter" | "higherIsWorse";

export interface LayerScale {
  colors: readonly string[];
  direction: ScaleDirection;
}

/**
 * Which ramp a map layer uses.
 *
 * `gap` (distance below a crop's own benchmark) and `priority` (urgency of
 * intervention) both read as pressure, so a darker step must mean more pressure,
 * not a better result.
 */
const BURDEN_LAYERS: ReadonlySet<MapLayer> = new Set<MapLayer>(["gap", "priority"]);

export function scaleForLayer(layer: MapLayer): LayerScale {
  return BURDEN_LAYERS.has(layer)
    ? { colors: SCALE_BURDEN, direction: "higherIsWorse" }
    : { colors: SCALE_POSITIVE, direction: "higherIsBetter" };
}

/**
 * Class breaks, as the class lower bounds implied by equal-frequency classes.
 *
 * Returns `classCount - 1` breaks in ascending order. Breaks that coincide with
 * the previous one are dropped, so a layer whose values are all equal yields a
 * single class instead of four empty ones.
 */
export function quantileCuts(values: readonly number[], classCount: number): number[] {
  const real = values.filter((value) => Number.isFinite(value));
  if (real.length === 0 || classCount < 2) return [];
  const sorted = [...real].sort((a, b) => a - b);
  const cuts: number[] = [];
  for (let index = 1; index < classCount; index += 1) {
    const position = Math.floor((index / classCount) * (sorted.length - 1));
    const cut = sorted[position];
    if (cuts.length === 0 || cut !== cuts[cuts.length - 1]) cuts.push(cut);
  }
  return cuts;
}

/**
 * The class a value falls in: the number of breaks it is strictly above.
 *
 * Class `k` therefore covers `(cuts[k-1], cuts[k]]`, with the first class open
 * below and the last open above.
 */
export function bandIndex(value: number, cuts: readonly number[]): number {
  let index = 0;
  for (const cut of cuts) if (value > cut) index += 1;
  return index;
}

/** Palette slot for a value, clamped to the number of available swatches. */
export function bandPaletteIndex(
  value: number,
  cuts: readonly number[],
  paletteSize: number,
): number {
  if (paletteSize <= 0) return 0;
  return Math.min(bandIndex(value, cuts), paletteSize - 1);
}

export interface Band {
  /** Position on the palette ramp. Stable across map and legend. */
  index: number;
  /** Open when null (the first class), inclusive otherwise. */
  lower: number | null;
  /** Open when null (the last class), inclusive otherwise. */
  upper: number | null;
  /** How many of the supplied values fall in this class. */
  count: number;
}

/**
 * The populated classes of a layer, in ascending order, with their bounds.
 *
 * Empty classes are omitted: a legend that lists a range no district falls in is
 * noise, and with a single-class layer (every value equal, or one district) the
 * result is one entry rather than four meaningless ones.
 */
export function bandsFor(
  values: readonly number[],
  classCount: number,
): { cuts: number[]; bands: Band[] } {
  const real = values.filter((value) => Number.isFinite(value));
  const cuts = quantileCuts(real, classCount);
  const counts = new Map<number, number>();
  for (const value of real) {
    const index = bandIndex(value, cuts);
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }

  const bands: Band[] = [];
  for (let index = 0; index <= cuts.length; index += 1) {
    const count = counts.get(index) ?? 0;
    if (count === 0) continue;
    bands.push({
      index,
      lower: index === 0 ? null : cuts[index - 1],
      upper: index === cuts.length ? null : cuts[index],
      count,
    });
  }
  return { cuts, bands };
}

/** Legend text for one class. Reads `≤ v`, `a – b`, or `> v`. */
export function formatBand(band: Band, format: (value: number) => string): string {
  if (band.lower === null && band.upper === null) return "—";
  if (band.lower === null) return `≤ ${format(band.upper as number)}`;
  if (band.upper === null) return `> ${format(band.lower)}`;
  if (band.lower === band.upper) return `= ${format(band.lower)}`;
  return `${format(band.lower)} – ${format(band.upper)}`;
}

/** Does this class legend need a direction note, and in which words? */
export function isSingleClass(bands: readonly Band[]): boolean {
  return bands.length === 1;
}
