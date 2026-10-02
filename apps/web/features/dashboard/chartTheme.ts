"use client";

import { useEffect, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";

/** Shared Recharts styling so every chart reads the same way.
 *
 * The categorical colours are chosen to stay distinguishable on both the light
 * and the dark surface, so they are theme-independent by design. Grid, axis and
 * tooltip chrome is re-themed with CSS in `app/globals.css` under `html.dark`:
 * Recharts emits stable class names (`recharts-cartesian-grid`, `recharts-text`,
 * `recharts-default-tooltip`) and writes `stroke` as an SVG presentation
 * attribute, where a CSS variable would not resolve. */
export const CHART = {
  primary: "#087F5B",
  forest: "#073D2D",
  blue: "#2563EB",
  amber: "#D97706",
  red: "#DC2626",
  green: "#16A34A",
  grid: "#e6eeea",
  axis: "#64748b",
};

export const AXIS_PROPS = {
  stroke: CHART.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid rgba(7,61,45,0.12)",
    fontSize: 12,
    boxShadow: "0 10px 30px rgba(3,45,35,0.12)",
  },
  labelStyle: { color: CHART.forest, fontWeight: 600 },
} as const;

/**
 * Whether charts should animate on mount.
 *
 * Recharts animates its series through requestAnimationFrame, so the CSS rule
 * that honours the reduced-motion preference cannot reach it. Charts spread
 * `{...useChartMotion()}` onto each series instead.
 *
 * The OS-level `prefers-reduced-motion` setting also disables it: a user who has
 * already asked the platform for less motion should not have to ask this
 * application separately.
 */
export function useChartMotion(): { isAnimationActive: boolean } {
  const { preferences } = usePreferences();
  const [osReducedMotion, setOsReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setOsReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return { isAnimationActive: !preferences.reducedMotion && !osReducedMotion };
}
