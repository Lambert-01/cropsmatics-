"use client";

import { Download, Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { api, reportUrl } from "@/lib/api";
import { fmtNumber } from "@/lib/format";

const PAGE_SIZE = 50;

export function DataTable({ datasetKey, label }: { datasetKey: string; label: string }) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useQuery({
    queryKey: ["dataset", datasetKey, applied, offset],
    queryFn: () => api.dataset(datasetKey, PAGE_SIZE, offset, applied),
  });

  const total = query.data?.count ?? 0;
  const columns = query.data?.columns ?? [];
  const rows = query.data?.rows ?? [];
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <Card className="overflow-hidden">
      <CardHeader title={label} subtitle={`Processed dataset · ${total} rows`} />
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className="input w-56 pl-8"
            placeholder="Search rows…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setApplied(search);
                setOffset(0);
              }
            }}
            aria-label="Search dataset rows"
          />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setApplied(search);
            setOffset(0);
          }}
        >
          Apply
        </button>
        {applied ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSearch("");
              setApplied("");
              setOffset(0);
            }}
          >
            Clear
          </button>
        ) : null}
        <a className="btn ml-auto" href={reportUrl(`/dataset/${datasetKey}.csv`)} download>
          <Download className="h-3.5 w-3.5" /> CSV
        </a>
      </div>

      <div className="px-4 pb-4 pt-3">
        {query.isLoading ? (
          <TableSkeleton rows={8} />
        ) : query.error ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No rows match this search."
            hint="Try another term, or clear the search to see the full dataset."
          />
        ) : (
          <>
            <div className="thin-scroll max-h-[34rem] overflow-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c}>{c.replace(/_/g, " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => {
                        const value = row[c];
                        return (
                          <td key={c} className="whitespace-nowrap">
                            {value === null || value === undefined
                              ? "—"
                              : typeof value === "number"
                                ? fmtNumber(value, Number.isInteger(value) ? 0 : 3)
                                : typeof value === "boolean"
                                  ? value
                                    ? "true"
                                    : "false"
                                  : String(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing {from}–{to} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={to >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <SourceNote>
        Source id: {query.data?.source_id ?? "—"}. Values come from the processed table, including
        provenance columns; nulls are shown as “—”, never as 0.
      </SourceNote>
    </Card>
  );
}
