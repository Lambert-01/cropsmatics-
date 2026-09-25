import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata = { title: "Yield Intelligence — Cropmatics Rwanda" };

export default function YieldIntelligencePage() {
  return (
    <ComingSoon
      title="Yield Intelligence"
      description="Season-aware yield modelling with district holdout validation is planned here. The baseline model, feature builder and evaluation code already exist under ml/; the dashboard surface is next."
    />
  );
}
