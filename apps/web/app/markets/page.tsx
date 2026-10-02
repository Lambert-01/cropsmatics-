"use client";

import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { MarketPricesView } from "@/features/markets/MarketPricesView";
import { MarketStatusPanel } from "@/features/markets/MarketStatusPanel";
import { useMarketCommodities, useMarketStatus } from "@/services/hooks/useMarkets";

/**
 * Market Intelligence.
 *
 * The page has two legitimate states and renders honest output in both:
 *
 * * **no verified prices** — a data-status view that states exactly what is
 *   registered, what is loaded and what is missing. It never shows a sample or
 *   illustrative price, because a plausible fake price is indistinguishable from
 *   a real one once it reaches a decision-maker.
 * * **prices loaded** — observations shown per price type, never averaged across
 *   types.
 */
export default function MarketsPage() {
  const status = useMarketStatus();
  // Only request commodities once the status confirms there is something to list.
  const commodities = useMarketCommodities(Boolean(status.data?.data_available));

  return (
    <div className="space-y-5">
      <PageHeading
        title="Market Intelligence"
        subtitle="Observed commodity prices by market and price type, with the source and coverage behind every figure."
      />

      {status.isLoading ? <KpiRowSkeleton count={4} /> : null}

      {status.isError ? (
        <ErrorState
          message={(status.error as Error).message}
          onRetry={() => status.refetch()}
        />
      ) : null}

      {status.data && !status.data.data_available ? (
        <MarketStatusPanel status={status.data} />
      ) : null}

      {status.data?.data_available ? (
        <MarketPricesView
          commodities={(commodities.data?.commodities ?? []).map((item) => item.commodity)}
        />
      ) : null}
    </div>
  );
}
