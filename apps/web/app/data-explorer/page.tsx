"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

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

  const datasets = useMemo(() => data?.datasets ?? [], [data]);
  const [selected, setSelected] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; datasets: typeof datasets }>();
    for (const dataset of datasets) {
      const current = groups.get(dataset.group) ?? {
        label: dataset.group_label,
        datasets: [],
      };
      current.datasets.push(dataset);
      groups.set(dataset.group, current);
    }
    return [...groups.entries()].map(([key, value]) => ({ key, ...value }));
  }, [datasets]);

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
  const activeDataset = datasets.find((d) => d.key === activeKey) ?? null;
  const activeGroup = activeDataset?.group ?? grouped[0]?.key ?? null;

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
          <div className="card space-y-3 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Browse by evidence group
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Current releases lead. Archive tables, programme context and reference dictionaries
                remain available without becoming primary navigation tabs.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Dataset groups">
              {grouped.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  role="tab"
                  aria-selected={activeGroup === group.key}
                  onClick={() => select(group.datasets[0]?.key ?? "")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    activeGroup === group.key
                      ? "bg-primary text-white"
                      : "border border-forest/15 bg-white text-slate-600 hover:bg-forest/5",
                  )}
                >
                  {group.label} ({group.datasets.length})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Datasets in active group">
              {(grouped.find((group) => group.key === activeGroup)?.datasets ?? []).map((d) => (
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
            {activeDataset ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-forest/10 pt-3 text-[11px] text-slate-500">
                <span>
                  <strong className="font-semibold text-forest-deep">Source:</strong>{" "}
                  {activeDataset.source_id || "resolved from the processed table"}
                </span>
                <span>
                  <strong className="font-semibold text-forest-deep">Accepted filters:</strong>{" "}
                  {activeDataset.filters.length ? activeDataset.filters.join(", ") : "none"}
                </span>
              </div>
            ) : null}
          </div>

          {activeKey ? <DataTable datasetKey={activeKey} label={activeLabel} /> : null}
        </>
      )}
    </div>
  );
}
