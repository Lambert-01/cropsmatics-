"use client";

import { useMemo } from "react";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { PageHero } from "@/components/layout/PageHero";
import { DataBadge } from "@/components/ui/DataBadge";
import { ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { LossByCropChart } from "@/features/postharvest/LossByCropChart";
import { RiskClassificationTable } from "@/features/postharvest/RiskClassificationTable";
import { StorageVsSoldChart } from "@/features/postharvest/StorageVsSoldChart";
import { UseCompositionChart } from "@/features/postharvest/UseCompositionChart";
import { NationalInfrastructureSummary } from "@/features/storage/NationalInfrastructureSummary";
import { fmtNumber, fmtPct } from "@/lib/format";
import { useFilters } from "@/services/hooks/useFilters";
import { usePostHarvest, useStorageInfrastructure } from "@/services/hooks/useAnalytics";
import type { PostHarvestCrop } from "@/types";

/** Highest value of a share column, with the crop it belongs to. */
function extreme(crops: PostHarvestCrop[], key: keyof PostHarvestCrop) {
  let best: { crop: string; value: number } | null = null;
  for (const c of crops) {
    const v = c[key];
    if (typeof v !== "number") continue;
    if (!best || v > best.value) best = { crop: c.crop, value: v };
  }
  return best;
}

export default function PostHarvestPage() {
  const { filters } = useFilters();
  // The post-harvest dataset supports the crop filter only; the filter bar
  // below says so explicitly instead of silently dropping the rest.
  const postHarvest = usePostHarvest(filters);
  const infrastructure = useStorageInfrastructure();
  const crops = postHarvest.data?.crops ?? [];

  // Presentation only: pick out the headline crop for each share. No value is
  // recomputed here — every number shown was returned by the API.
  const headline = useMemo(
    () => ({
      loss: extreme(postHarvest.data?.crops ?? [], "post_harvest_losses_pct"),
      stored: extreme(postHarvest.data?.crops ?? [], "stored_pct"),
      sold: extreme(postHarvest.data?.crops ?? [], "sold_pct"),
    }),
    [postHarvest.data],
  );

  return (
    <div className="space-y-5">
      <PageHero
        title="Post-Harvest Intelligence"
        subtitle="How crops are sold, consumed, stored and lost — and where storage risk concentrates."
      />

      <AnalyticsFilterBar
        supported={"crop"}
        datasetNote="National crop-level dataset (2025-B): year, season and district filters do not apply to this data."
      />

      {postHarvest.error ? (
        <ErrorState
          message={(postHarvest.error as Error).message}
          onRetry={() => postHarvest.refetch()}
        />
      ) : null}

      {postHarvest.isLoading ? (
        <KpiRowSkeleton count={4} />
      ) : postHarvest.data ? (
        <DashboardKpis kpis={postHarvest.data.kpis} />
      ) : null}

      {/* Headline crop per share, so the page answers "which crop?" at a glance. */}
      {crops.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Highest loss crop", data: headline.loss, unit: "% of production lost", tone: "danger" },
            { label: "Highest storage crop", data: headline.stored, unit: "% stored", tone: "primary" },
            { label: "Highest marketed crop", data: headline.sold, unit: "% sold", tone: "amber" },
          ].map((card) => (
            <div key={card.label} className="card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {card.label}
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-forest-deep">
                {card.data?.crop ?? "—"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {card.data ? `${fmtPct(card.data.value, 2)} ${card.unit}` : "not reported"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <LossByCropChart crops={crops} isLoading={postHarvest.isLoading} />
        <StorageVsSoldChart crops={crops} isLoading={postHarvest.isLoading} />
      </div>

      <RiskClassificationTable crops={crops} />

      <UseCompositionChart crops={crops} isLoading={postHarvest.isLoading} />

      {/* Official national storage capacity context for the same period. */}
      <section aria-labelledby="national-infra" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="national-infra" className="text-sm font-semibold text-forest-deep">
            Where that produce could be stored
          </h2>
          <DataBadge kind="official_national" />
        </div>
        {infrastructure.data?.totals ? (
          <p className="text-xs text-slate-600">
            Rwanda has{" "}
            <strong className="text-forest">
              {fmtNumber(infrastructure.data.totals.total_number, 0)}
            </strong>{" "}
            post-harvest facilities with a published national capacity of{" "}
            <strong className="text-forest">
              {fmtNumber(infrastructure.data.totals.total_capacity_mt, 0)} mt
            </strong>
            . These are national totals — they are not available capacity in any single district.
          </p>
        ) : null}
        <NationalInfrastructureSummary
          data={infrastructure.data}
          isLoading={infrastructure.isLoading}
        />
      </section>

      {postHarvest.data ? <ProvenanceCard provenance={postHarvest.data.provenance} /> : null}
    </div>
  );
}
