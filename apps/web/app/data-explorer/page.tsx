"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeading } from "@/components/ui/PageHeading";
import { ErrorState, TableSkeleton } from "@/components/ui/States";
import { DataTable } from "@/features/data-explorer/DataTable";
import { api } from "@/lib/api";

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
          <div className="card space-y-4 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Dataset library
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-forest-deep">
                  All processed evidence tables
                </h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
                  Browse the real multi-period SAS panels, legacy release extracts, official program
                  context and reference dictionaries used by Cropmatics. Choose a table below; its
                  exact filters and provenance appear with the rows.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[430px]">
                <div className="rounded-lg border border-forest/10 bg-white px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tables</p>
                  <p className="mt-1 text-lg font-semibold text-forest-deep">{datasets.length}</p>
                </div>
                {grouped.slice(0, 3).map((group) => (
                  <div key={group.key} className="rounded-lg border border-forest/10 bg-white px-3 py-2">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {group.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-forest-deep">{group.datasets.length}</p>
                  </div>
                ))}
              </div>
            </div>

            <label className="block max-w-3xl">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Select a dataset
              </span>
              <select
                className="input w-full"
                value={activeKey ?? ""}
                onChange={(event) => select(event.target.value)}
                aria-label="Select a dataset"
              >
                {grouped.map((group) => (
                  <optgroup key={group.key} label={`${group.label} · ${group.datasets.length} tables`}>
                    {group.datasets.map((dataset) => (
                      <option key={dataset.key} value={dataset.key}>
                        {dataset.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {activeDataset ? (
              <div className="grid gap-2 border-t border-forest/10 pt-3 text-[11px] text-slate-600 sm:grid-cols-[auto_1fr]">
                <span className="font-semibold text-forest-deep">Source</span>
                <span className="break-words">{activeDataset.source_id || "Resolved from the processed table"}</span>
                <span className="font-semibold text-forest-deep">Available filters</span>
                <span>
                  {activeDataset.filters.length
                    ? activeDataset.filters
                        .map((filter) => filter.replace(/_/g, " "))
                        .join(" · ")
                    : "None — browse or search the rows"}
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
