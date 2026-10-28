"use client";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { CHART } from "@/features/dashboard/chartTheme";
import { fmtPct } from "@/lib/format";
import type { PostHarvestCrop } from "@/types";

/** The published use shares, in the order the source reports them. */
const SEGMENTS: { key: keyof PostHarvestCrop; label: string; color: string }[] = [
  { key: "sold_pct", label: "Sold", color: CHART.primary },
  { key: "own_consumption_pct", label: "Own consumption", color: CHART.blue },
  { key: "stored_pct", label: "Stored", color: CHART.amber },
  { key: "seeds_pct", label: "Seeds", color: CHART.green },
  { key: "fodder_pct", label: "Fodder", color: "#0f766e" },
  { key: "other_usage_pct", label: "Other", color: "#94a3b8" },
];

function share(row: PostHarvestCrop, key: keyof PostHarvestCrop): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function VariantProfile({ row }: { row: PostHarvestCrop }) {
  const published = SEGMENTS.map((segment) => ({
    ...segment,
    value: share(row, segment.key),
  })).filter((segment): segment is typeof segment & { value: number } => segment.value !== null);
  const total = published.reduce((sum, segment) => sum + segment.value, 0);
  const loss = share(row, "post_harvest_losses_pct");

  return (
    <div className="rounded-lg border border-slate-200/80 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{row.crop}</h3>
        {row.canonical_crop_name && row.canonical_crop_name !== row.crop ? (
          <span className="text-[11px] text-slate-500">Canonical crop: {row.canonical_crop_name}</span>
        ) : null}
      </div>

      {published.length > 0 ? (
        <>
          <div className="flex h-4 overflow-hidden rounded-md" aria-hidden="true">
            {published.map((segment) => (
              <div
                key={segment.key}
                style={{ width: `${total ? (segment.value / total) * 100 : 0}%`, backgroundColor: segment.color }}
              />
            ))}
          </div>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {published.map((segment) => (
              <li key={segment.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: segment.color }}
                    aria-hidden="true"
                  />
                  {segment.label}
                </span>
                <span className="font-medium tabular-nums text-slate-700">{fmtPct(segment.value, 1)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="text-xs text-slate-500">No use shares are published for this variant.</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Post-harvest loss
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            loss == null
              ? "bg-slate-500/10 text-slate-500"
              : loss >= 20
                ? "bg-danger/10 text-danger"
                : loss >= 10
                  ? "bg-amber/10 text-amber"
                  : "bg-success/10 text-success"
          }`}
        >
          {loss == null ? "Not published" : fmtPct(loss, 1)}
        </span>
        {row.risk_band ? (
          <span className="rounded-full border border-forest/15 px-2 py-0.5 text-xs text-slate-600">
            Risk band: {row.risk_band}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One crop's national post-harvest profile.
 *
 * Post-harvest shares are published at national, crop level only — the endpoint
 * never fabricates district granularity — so this card is explicitly national
 * even when the page carries a district filter.
 */
export function CropPostHarvestCard({
  crops,
  cropName,
  isLoading,
}: {
  crops: PostHarvestCrop[];
  cropName?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Post-harvest profile" subtitle="National, crop level" />
        <div className="p-4">
          <div className="h-20 animate-pulse rounded-lg bg-forest/[0.06]" aria-hidden="true" />
        </div>
      </Card>
    );
  }

  const matchingRows = cropName
    ? crops.filter((c) => {
        const requested = cropName.trim().toLowerCase();
        return (
          c.crop?.trim().toLowerCase() === requested ||
          c.canonical_crop_name?.trim().toLowerCase() === requested
        );
      })
    : [];

  if (matchingRows.length === 0) {
    return (
      <Card>
        <CardHeader title="Post-harvest profile" subtitle="National, crop level" />
        <div className="p-4">
          <EmptyState
            title="No post-harvest profile published for this crop."
            hint="The national post-harvest table does not carry a row for this crop in the current release."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Post-harvest profile"
        subtitle={
          matchingRows.length > 1
            ? `National, crop level — ${matchingRows.length} published variants`
            : "National, crop level — how this crop's production is used and lost"
        }
      />

      {matchingRows.length > 1 ? (
        <p className="px-4 pt-3 text-xs leading-relaxed text-slate-600">
          The source publishes these variants separately. They remain separate here because the
          table does not publish weights for a defensible combined percentage.
        </p>
      ) : null}
      <div className="space-y-3 p-4">
        {matchingRows.map((row) => <VariantProfile key={row.crop} row={row} />)}
      </div>

      <SourceNote>
        National crop-level shares. The district filter does not apply to this table, and no
        district-level post-harvest value is inferred for it. Shares may not sum to exactly 100
        because of rounding; the pipeline flags any row outside a 1-point tolerance.
      </SourceNote>
    </Card>
  );
}
