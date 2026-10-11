/**
 * Presentation helpers for the assistant's structured answer.
 *
 * Kept out of the screen so the formatting that pairs a figure with the unit the
 * API published it under is directly unit-testable. Two rules are load-bearing:
 *
 *  - a figure is never shown under a unit it was not published in, and
 *  - a value that is not a finite number is shown as it arrived (a missing
 *    observation is "—", never 0).
 */

/** One figure exactly as the backend publishes it. */
export interface FigureLike {
  value: number | string | null | undefined;
  unit?: string | null;
  crop?: string | null;
  district?: string | null;
  period_code?: string | null;
}

/**
 * Render a figure's value, keeping the published unit.
 *
 * Precision is chosen from the magnitude so a yield in t/ha keeps its decimals
 * while a production total in the millions does not grow meaningless trailing
 * zeros.
 */
export function formatFigureValue(value: number | string | null | undefined, unit?: string | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value ?? "—");
  const digits =
    Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 2 : 3;
  const text = value.toLocaleString(undefined, { maximumFractionDigits: digits });
  return unit ? `${text} ${unit}` : text;
}

/**
 * The crop · district · period line shown under a figure's label.
 *
 * Returns null when the figure carries none of them, so the caller renders no
 * empty line and no orphaned separator.
 */
export function figureContext(figure: FigureLike): string | null {
  const parts = [figure.crop, figure.district, figure.period_code].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
