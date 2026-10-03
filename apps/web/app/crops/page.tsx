"use client";

import { ChevronRight, Snowflake } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { PageHero } from "@/components/layout/PageHero";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { groupCropsByCategory } from "@/features/crops/catalog";
import { useCrops } from "@/services/hooks/useReference";

/**
 * Crop catalogue.
 *
 * The entry point to the per-crop Crop Intelligence workspace. It lists only the
 * crops the API publishes, grouped by the category the catalogue carries — no
 * crop is invented, and a crop with no published rows simply does not appear.
 */
export default function CropCataloguePage() {
  const { data: cropList, error, isLoading, refetch } = useCrops();

  const groups = useMemo(() => groupCropsByCategory(cropList), [cropList]);

  return (
    <div className="space-y-5">
      <PageHero
        title="Crop Intelligence"
        subtitle="Open any published crop for its productivity, geographic distribution and post-harvest profile."
      />

      {error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}

      {isLoading ? <TableSkeleton rows={6} /> : null}

      {!isLoading && groups.length === 0 ? (
        <EmptyState
          title="No crops are published."
          hint="The crop catalogue is empty. Build the processed tables and check that the API is running."
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.category}>
            <CardHeader
              title={group.category}
              subtitle={`${group.items.length} published crop${group.items.length === 1 ? "" : "s"}`}
            />
            <ul className="divide-y divide-forest/5">
              {group.items.map((crop) => (
                <li key={crop.crop_code}>
                  <Link
                    href={`/crops/${encodeURIComponent(crop.crop_code)}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition hover:bg-forest/[0.03]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-forest">{crop.crop_name}</span>
                      {crop.kinyarwanda_name ? (
                        <span className="truncate text-xs text-slate-400">
                          {crop.kinyarwanda_name}
                        </span>
                      ) : null}
                      {crop.cold_chain_recommended ? (
                        <Snowflake className="h-3.5 w-3.5 shrink-0 text-info" aria-label="Cold chain recommended" />
                      ) : null}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
