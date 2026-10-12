"use client";

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
import { UseHistoryPanel } from "@/features/postharvest/UseHistoryPanel";
import { NationalInfrastructureSummary } from "@/features/storage/NationalInfrastructureSummary";
import { fmtNumber, fmtPct } from "@/lib/format";
import { useFilters } from "@/services/hooks/useFilters";
import { usePostHarvest, usePostharvestHistory, useStorageInfrastructure } from "@/services/hooks/useAnalytics";

/**
 * The first screenful: which crop leads each share.
 *
 * The picks come from the API. Choosing a maximum is an analytical decision -
 * it decides which crop the page leads with - so it is made once in Python and
 * returned with the number of crops it was chosen from. This page used to search
 * the crop list itself, which meant the headline could disagree with the same
 * figure on mobile, and could change if a null were handled differently here.
 */
export default function PostHarvestPage() {
  const { filters } = useFilters();
  // The post-harvest dataset supports the crop filter only; the filter bar
  // below says so explicitly instead of silently dropping the rest.
  const postHarvest = usePostHarvest(filters);
  const history = usePostharvestHistory();
  const infrastructure = useStorageInfrastructure();
  const crops = postHarvest.data?.crops ?? [];
  const headlines = postHarvest.data?.headlines ?? [];

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

      {/* Headline crop per share, so the page answers "which crop?" at a glance.
          Rendered straight from the API's pick, including the crop count it was
          chosen from. */}
      {headlines.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {headlines.map((headline) => (
            <div key={headline.id} className="card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {headline.label}
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-forest-deep">
                {headline.crop ?? "—"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {headline.value === null || headline.value === undefined
                  ? "not reported"
                  : `${fmtPct(headline.value, 2)} ${headline.unit}`}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                highest of {fmtNumber(headline.n_crops_considered, 0)} crops in this selection
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

      {/* The same use shares across every published release, so the page answers
          "how did this change?" and not only "what is it now?". */}
      <UseHistoryPanel
        data={history.data}
        isLoading={history.isLoading}
        isFetching={history.isFetching}
        hasError={Boolean(history.error)}
        errorMessage={history.error ? (history.error as Error).message : undefined}
        onRetry={() => history.refetch()}
        initialCrop={filters.crop ?? undefined}
      />

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
