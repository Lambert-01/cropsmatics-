import { Info, Lightbulb } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { fmtNumber, periodLabel } from "@/lib/format";
import type { KPI, PriorityRow } from "@/types";

/**
 * Narrates values the API already returned. It never computes a statistic and
 * never asserts causality — it only frames the Python results for a reader.
 */
export function InsightPanel({
  kpis,
  priorities,
  period,
  coverageLevel,
}: {
  kpis: KPI[];
  priorities: PriorityRow[];
  period?: string | null;
  coverageLevel?: string | null;
}) {
  const byId = (id: string) => kpis.find((k) => k.id === id);
  const top = priorities[0];
  const gap = byId("median_gap");
  const highGap = byId("high_gap");

  const bullets: string[] = [];
  if (top) {
    bullets.push(
      `${top.district} · ${top.crop} currently ranks highest for investigation (priority ${fmtNumber(
        top.score * 100,
        0,
      )}/100, gap ${fmtNumber(top.gap, 1)}%).`,
    );
  }
  if (gap?.value != null) {
    bullets.push(
      `The median district-crop observation sits ${fmtNumber(gap.value, 1)}% away from its ${gap.note ?? "benchmark"}, across the current selection.`,
    );
  }
  if (highGap?.value != null) {
    bullets.push(
      `${fmtNumber(highGap.value, 0)} district-crop observations are at least 25% below benchmark and deserve review first.`,
    );
  }
  if (coverageLevel && coverageLevel !== "district") {
    bullets.push("This period has national coverage only; district estimates are not fabricated.");
  }

  return (
    <Card>
      <CardHeader
        title="What the data say"
        subtitle={`Period ${periodLabel(period)} — associations, not causes`}
      />
      <ul className="space-y-2 px-4 pb-2 pt-3 text-sm text-slate-700">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
            <span>{b}</span>
          </li>
        ))}
        {bullets.length === 0 ? (
          <li className="text-slate-500">No verified observations for this selection.</li>
        ) : null}
      </ul>
      <p className="flex items-start gap-2 border-t border-forest/5 px-4 py-3 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Rankings describe where to look first. They do not establish that an intervention will cause
        a yield change.
      </p>
    </Card>
  );
}
