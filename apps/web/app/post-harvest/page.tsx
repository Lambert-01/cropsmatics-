"use client";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { LossByCropChart } from "@/features/postharvest/LossByCropChart";
import { RiskClassificationTable } from "@/features/postharvest/RiskClassificationTable";
import { UseCompositionChart } from "@/features/postharvest/UseCompositionChart";
import { usePostHarvest } from "@/services/hooks/useAnalytics";

export default function PostHarvestPage() {
  const postHarvest = usePostHarvest();

  return (
    <div className="space-y-5">
      <PageHeading
        title="Post-Harvest Intelligence"
        subtitle="How crops are sold, consumed, stored and lost — and where storage risk concentrates."
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

      <div className="grid gap-5 xl:grid-cols-2">
        <LossByCropChart
          crops={postHarvest.data?.crops ?? []}
          isLoading={postHarvest.isLoading}
        />
        <RiskClassificationTable crops={postHarvest.data?.crops ?? []} />
      </div>

      <UseCompositionChart
        crops={postHarvest.data?.crops ?? []}
        isLoading={postHarvest.isLoading}
      />

      {postHarvest.data ? <ProvenanceCard provenance={postHarvest.data.provenance} /> : null}
    </div>
  );
}
