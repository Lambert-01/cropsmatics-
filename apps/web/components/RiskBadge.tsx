import { riskStyle } from "@/lib/theme";

export function RiskBadge({ band }: { band: string | null | undefined }) {
  const s = riskStyle(band);
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium ${s.color}`}>
      <span aria-hidden="true">{s.icon}</span>
      <span>{s.label}</span>
      <span className="sr-only">{s.hint}</span>
    </span>
  );
}
