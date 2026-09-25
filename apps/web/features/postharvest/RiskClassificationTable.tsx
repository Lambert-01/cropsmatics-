"use client";

import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { PostHarvestCrop } from "@/types";

/** Reported loss share per crop with a documented heuristic band. */
export function RiskClassificationTable({ crops }: { crops: PostHarvestCrop[] }) {
  const sorted = [...crops].sort(
    (a, b) => (b.post_harvest_losses_pct ?? -1) - (a.post_harvest_losses_pct ?? -1),
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Loss classification by crop"
        subtitle="Heuristic bands on the reported loss share — not model probabilities"
      />
      {sorted.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <div className="thin-scroll mt-3 max-h-[26rem] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Crop</th>
                <th className="text-right">Loss</th>
                <th className="text-right">Stored</th>
                <th className="text-right">Sold</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.crop}>
                  <td className="font-medium text-slate-700">{c.crop}</td>
                  <td className="text-right">{fmtNumber(c.post_harvest_losses_pct ?? null, 2)}%</td>
                  <td className="text-right">{fmtNumber(c.stored_pct ?? null, 2)}%</td>
                  <td className="text-right">{fmtNumber(c.sold_pct ?? null, 2)}%</td>
                  <td>
                    <PriorityBadge band={c.risk_band} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SourceNote>
        Bands: HIGH ≥ 1.0%, MODERATE ≥ 0.5%, otherwise LOW. Thresholds are documented in
        postharvest_service and are not calibrated risk probabilities.
      </SourceNote>
    </Card>
  );
}
