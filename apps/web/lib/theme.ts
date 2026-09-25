/**
 * Design tokens and risk presentation.
 *
 * Risk is never communicated by colour alone: every band ships with an icon and
 * a text label (accessibility requirement, docs/08_WEB_APPLICATION.md).
 */
export type RiskBand = "LOW" | "MODERATE" | "HIGH";

export const RISK: Record<RiskBand, { color: string; icon: string; label: string; hint: string }> = {
  LOW: { color: "text-risk-low", icon: "✓", label: "Low", hint: "Standard handling" },
  MODERATE: { color: "text-risk-moderate", icon: "!", label: "Moderate", hint: "Take precautions" },
  HIGH: { color: "text-risk-high", icon: "▲", label: "High", hint: "Act now" },
};

export function riskStyle(band: string | null | undefined) {
  const key = (band ?? "").toUpperCase() as RiskBand;
  return RISK[key] ?? RISK.MODERATE;
}
