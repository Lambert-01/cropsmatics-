/**
 * Accessible semantic scales for the choropleth.
 *
 * For "higher is worse" metrics (productivity gap, priority) the scale runs
 * dark-green -> red. For "higher is better" metrics (yield) it is reversed so
 * the colour meaning always matches the metric semantics. The legend is always
 * rendered, and a colour never carries the message alone.
 */

const WORSE = ["#166534", "#4ade80", "#facc15", "#f97316", "#dc2626"];

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

export interface ColorScale {
  stops: string[];
  color: (value: number | null | undefined) => string;
  min: number;
  max: number;
}

export function makeScale(
  min: number,
  max: number,
  higherIs: "better" | "worse" | "neutral",
): ColorScale {
  const stops = higherIs === "better" ? [...WORSE].reverse() : WORSE;
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max !== min ? max : safeMin + 1;

  return {
    stops,
    min: safeMin,
    max: safeMax,
    color: (value) => {
      if (value === null || value === undefined || Number.isNaN(value)) return "#e2e8f0";
      const t = Math.max(0, Math.min(1, (value - safeMin) / (safeMax - safeMin)));
      const scaled = t * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(scaled));
      return mix(stops[i], stops[i + 1], scaled - i);
    },
  };
}
