/** Mobile design tokens. Never hardcode colours in screens. */
export const colors = {
  // Brand greens
  forestDeep: "#032D23",
  forest: "#073D2D",
  primary: "#087F5B",
  primaryStrong: "#056A4A",
  mint: "#DDF5EB",
  mintLight: "#EFFAF5",

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

  // Surfaces
  border: "#DDE7E2",
  surface: "#FFFFFF",
  background: "#F7FAF8",
  white: "#FFFFFF",

  // Risk bands (icon + text + colour — never colour alone)
  riskLow: "#16a34a",
  riskModerate: "#D97706",
  riskHigh: "#DC2626",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const typography = {
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
};

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
