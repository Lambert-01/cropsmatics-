/** Mobile design tokens. Never hardcode colours in screens. */
export const colors = {
  // Brand greens
  forestDeep: "#032D23",
  forest: "#073D2D",
  primary: "#087F5B",
  primaryStrong: "#056A4A",
  mint: "#DDF5EB",
  mintLight: "#EFFAF5",

  mintSoft: "#EFFAF5",
  primaryDark: "#056A4A",
  slate300: "#CBD5E1",

  // Aliases kept for backward compat
  brandGreen: "#087F5B",
  success: "#16a34a",
  tint: "#DDF5EB",
  overlayTint: "rgba(7,61,45,0.06)",

  // Semantic
  blue: "#2563EB",
  blueSoft: "#E8F3FF",
  info: "#2563EB",
  amber: "#D97706",
  amberSoft: "#FFF4D6",
  danger: "#DC2626",
  dangerSoft: "#FEECEC",

  // Neutrals
  slate900: "#0F172A",
  slate700: "#334155",
  slate500: "#64748B",
  slate: "#334155",
  muted: "#64748B",

  // Tinted surfaces for semantic badges
  positiveSoft: "#E7F7EF",
  negativeSoft: "#FEECEC",

  // Data-surface neutrals. A analytical interface separates sections with thin
  // rules rather than lifting every block onto its own card.
  hairline: "#E4EBE7",
  grid: "#EDF3F0",
  axis: "#94A3B8",
  /** Reserved for "no verified value". Never used as a series colour. */
  missing: "#CBD5E1",

  // Surfaces
  border: "#DDE7E2",
  surface: "#FFFFFF",
  /** A surface raised above `surface` (sheets, selected rows, popovers). */
  elevated: "#FFFFFF",
  background: "#F7FAF8",
  white: "#FFFFFF",

  // Risk bands (icon + text + colour — never colour alone)
  riskLow: "#16a34a",
  riskModerate: "#D97706",
  riskHigh: "#DC2626",
};

/**
 * Dark palette. Same token names as `colors`, so a component that reads from
 * `useTheme()` renders identically in either scheme.
 *
 * Near-black surfaces carry a faint green cast to stay on-brand; brand text
 * becomes light mint, while `primary` stays a saturated green so solid primary
 * buttons keep white text legible.
 */
export const darkColors: typeof colors = {
  ...colors,
  // Brand
  forestDeep: "#ECFDF5",
  forest: "#D1FAE5",
  primary: "#0E9F6E",
  primaryStrong: "#10B981",
  primaryDark: "#10B981",
  brandGreen: "#0E9F6E",
  mint: "#12312A",
  mintLight: "#0F241E",
  mintSoft: "#12261F",
  tint: "#12261F",
  overlayTint: "rgba(255,255,255,0.06)",

  // Semantic
  blue: "#60A5FA",
  blueSoft: "#12263A",
  info: "#60A5FA",
  amber: "#FBBF24",
  amberSoft: "#3A2E10",
  danger: "#F87171",
  dangerSoft: "#3A1A1A",
  success: "#34D399",

  // Neutrals
  slate900: "#F1F5F9",
  slate700: "#CBD5E1",
  slate500: "#94A3B8",
  slate: "#CBD5E1",
  muted: "#94A3B8",
  slate300: "#3A4A44",

  // Data-surface neutrals
  hairline: "#1F332C",
  grid: "#1B2A25",
  axis: "#7C8F87",
  missing: "#3A4A44",

  // Tinted surfaces for semantic badges
  positiveSoft: "#12312A",
  negativeSoft: "#3A1A1A",

  // Surfaces
  border: "#243A33",
  surface: "#111C18",
  /** A surface raised above `surface` (sheets, selected rows, popovers). */
  elevated: "#16251F",
  background: "#07140F",

  // Risk bands (icon + text + colour — never colour alone)
  riskLow: "#34D399",
  riskModerate: "#FBBF24",
  riskHigh: "#F87171",
};

export type Palette = typeof colors;
export const palettes: Record<"light" | "dark", Palette> = {
  light: colors,
  dark: darkColors,
};

/**
 * Hero scrim over the Rwanda landscape.
 *
 * A two-stop forest-green overlay: light at the top so the image reads, dark at
 * the bottom so white hero copy stays legible. Kept here so mobile and web tune
 * the same artwork the same way.
 */
export const heroScrim = {
  top: "rgba(3,32,25,0.18)",
  middle: "rgba(3,32,25,0.55)",
  bottom: "rgba(3,32,25,0.90)",
} as const;

/**
 * Categorical series palette, in assignment order.
 *
 * Chosen so that adjacent series stay distinguishable for the common
 * red/green colour-vision deficiencies and under a greyscale print, and so a
 * multi-series chart is not five shades of green. Colour is never the only
 * encoding: every series also carries a label in an accessible legend.
 */
export const series = [
  "#087F5B", // primary green
  "#2563EB", // blue
  "#D97706", // amber
  "#7C3AED", // violet
  "#0E7490", // cyan
  "#BE185D", // magenta
] as const;

/** Deterministic series colour so a series keeps its colour across renders. */
export function seriesColor(index: number): string {
  return series[((index % series.length) + series.length) % series.length];
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

/**
 * Chart and hit-target metrics, in one place so every chart agrees on how much
 * room a plot needs and how large a touch target is.
 */
export const chart = {
  compactHeight: 120,
  height: 208,
  tallHeight: 276,
  pad: { top: 16, right: 14, bottom: 28, left: 46 },
  strokeWidth: 2.25,
  pointRadius: 3.5,
  /** Half-width of the crosshair snap window, in px. */
  hitRadius: 24,
  /** Android accessibility minimum; every interactive control meets this. */
  minTouchTarget: 44,
};

/** Rules an interactive control must respect to stay usable on a phone. */
export const touch = {
  minTarget: chart.minTouchTarget,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

/**
 * Typography for a palette.
 *
 * Colours are baked into the text styles, so typography is a function of the
 * active palette rather than a constant: in dark mode every text style must
 * resolve to the dark foreground, and a frozen object would keep light ink on a
 * near-black surface. Components read it from `useTheme().typography`.
 */
export function makeTypography(colors: Palette) {
  return {
  display: { fontSize: 28, fontWeight: "700" as const, color: colors.forestDeep },
  h1: { fontSize: 24, fontWeight: "700" as const, color: colors.forestDeep },
  h2: { fontSize: 18, fontWeight: "700" as const, color: colors.forest },
  h3: { fontSize: 16, fontWeight: "600" as const, color: colors.forest },
  body: { fontSize: 15, color: colors.slate },
  bodySmall: { fontSize: 14, color: colors.slate },
  caption: { fontSize: 13, color: colors.muted },
  micro: { fontSize: 12, color: colors.muted },
  metric: { fontSize: 22, fontWeight: "700" as const, color: colors.forestDeep },
  label: { fontSize: 13, fontWeight: "600" as const, color: colors.slate700 },

  // ---- Numeric hierarchy ---------------------------------------------------
  // Tabular figures keep columns of numbers aligned and stop a value from
  // reflowing while the user drags a chart crosshair.
  numericLarge: {
    fontSize: 30,
    fontWeight: "700" as const,
    color: colors.forestDeep,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
  numeric: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: colors.forestDeep,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
  numericSmall: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.slate700,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
  unit: { fontSize: 13, fontWeight: "600" as const, color: colors.slate500 },
  axisLabel: {
    fontSize: 10,
    color: colors.slate500,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
  /**
   * Section/label treatment used across data surfaces.
   *
   * Letter spacing stays at zero: tracking looks deliberate on a marketing
   * page and like a defect on a dense data screen, and it moves the edge of a
   * label that has to line up with a figure below it.
   */
  microCaps: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.slate500,
    letterSpacing: 0,
  },
  };
}

export type Typography = ReturnType<typeof makeTypography>;

/** Light-mode typography, for non-React modules only. Components use `useTheme()`. */
export const typography: Typography = makeTypography(colors);

export const shadow = {
  card: {
    shadowColor: "#032D23",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  strong: {
    shadowColor: "#032D23",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  /** Lifted sheet used by the map's selected-district panel. */
  sheet: {
    shadowColor: "#032D23",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  /** No lift — flat analytical sections. */
  none: {
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
};

export type RiskBand = "LOW" | "MODERATE" | "HIGH";

export const riskPresentation: Record<RiskBand, { color: string; icon: string; label: string }> = {
  LOW: { color: colors.riskLow, icon: "✓", label: "Low" },
  MODERATE: { color: colors.riskModerate, icon: "!", label: "Moderate" },
  HIGH: { color: colors.riskHigh, icon: "▲", label: "High" },
};

export function riskFor(band: string | null | undefined) {
  const key = (band ?? "").toUpperCase() as RiskBand;
  return riskPresentation[key] ?? riskPresentation.MODERATE;
}
