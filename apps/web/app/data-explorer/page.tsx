"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const datasets = data?.datasets ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  // A `?dataset=` link (e.g. from the global search) opens that dataset. An
  // unknown key falls back to the first dataset rather than rendering nothing,
  // so a stale shared link degrades instead of breaking.
  const requested = searchParams.get("dataset");
  const activeKey =
    selected ??
    (requested && datasets.some((d) => d.key === requested) ? requested : null) ??
    datasets[0]?.key ??
    null;
  const activeLabel = datasets.find((d) => d.key === activeKey)?.label ?? "";

  function select(key: string) {
    setSelected(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set("dataset", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

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
                onClick={() => select(d.key)}
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
