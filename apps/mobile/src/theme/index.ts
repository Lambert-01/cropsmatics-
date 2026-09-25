/** Mobile design tokens. Never hardcode colours in screens. */
export const colors = {
  forestDeep: "#032d23",
  forest: "#073d2d",
  brandGreen: "#087f5b",
  primary: "#087f5b",
  success: "#16a34a",
  slate: "#334155",
  muted: "#64748b",
  background: "#f7faf8",
  surface: "#ffffff",
  border: "#e2e8f0",
  white: "#ffffff",
  riskLow: "#16a34a",
  riskModerate: "#d97706",
  amber: "#d97706",
  riskHigh: "#dc2626",
  danger: "#dc2626",
  info: "#2563eb",
  // Small tint used for selected chips (kept as a token, not inline).
  tint: "#e6f4ef",
  overlayTint: "rgba(7,61,45,0.06)",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const typography = {
  h1: { fontSize: 24, fontWeight: "700" as const, color: colors.forestDeep },
  h2: { fontSize: 18, fontWeight: "700" as const, color: colors.forest },
  body: { fontSize: 14, color: colors.slate },
  caption: { fontSize: 12, color: colors.muted },
  metric: { fontSize: 22, fontWeight: "700" as const, color: colors.forestDeep },
};

export const shadow = {
  card: {
    shadowColor: "#032d23",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

export type RiskBand = "LOW" | "MODERATE" | "HIGH";

/** Risk is always icon + text + colour (never colour alone). */
export const riskPresentation: Record<RiskBand, { color: string; icon: string; label: string }> = {
  LOW: { color: colors.riskLow, icon: "✓", label: "Low" },
  MODERATE: { color: colors.riskModerate, icon: "!", label: "Moderate" },
  HIGH: { color: colors.riskHigh, icon: "▲", label: "High" },
};

export function riskFor(band: string | null | undefined) {
  const key = (band ?? "").toUpperCase() as RiskBand;
  return riskPresentation[key] ?? riskPresentation.MODERATE;
}
