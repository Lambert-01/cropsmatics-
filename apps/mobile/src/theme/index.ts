/** Mobile design tokens. Never hardcode colours in screens. */
export const colors = {
  brandGreen: "#087f5b",
  forest: "#0b3d2e",
  slate: "#334155",
  background: "#f8fafc",
  surface: "#ffffff",
  border: "#e2e8f0",
  white: "#ffffff",
  riskLow: "#16a34a",
  riskModerate: "#d97706",
  riskHigh: "#dc2626",
  info: "#2563eb",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 6, md: 10, lg: 16 };

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
