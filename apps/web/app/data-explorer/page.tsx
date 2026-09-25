"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState, TableSkeleton } from "@/components/ui/States";
import { DataTable } from "@/features/data-explorer/DataTable";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export default function DataExplorerPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["datasets"],
    queryFn: api.datasets,
  });

  const datasets = data?.datasets ?? [];
  const [active, setActive] = useState<string | null>(null);
  const activeKey = active ?? datasets[0]?.key ?? null;
  const activeLabel = datasets.find((d) => d.key === activeKey)?.label ?? "";

  return (
    <div className="space-y-5">
      <PageHeading
        title="Data Explorer"
        subtitle="Exactly what Cropmatics uses — search, sort, page through and download each processed dataset."
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Datasets">
            {datasets.map((d) => (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={activeKey === d.key}
                onClick={() => setActive(d.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  activeKey === d.key
                    ? "bg-primary text-white"
                    : "border border-forest/15 bg-white text-slate-600 hover:bg-forest/5",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          {activeKey ? <DataTable datasetKey={activeKey} label={activeLabel} /> : null}
        </>
      )}
    </div>
  );
}
