"use client";

import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ResponsiveTable, type Column } from "@/components/table/ResponsiveTable";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { api } from "@/lib/api";
import { apiUrl } from "@/lib/apiUrl";
import { fmtNumber } from "@/lib/format";

const PROVENANCE_COLUMNS = new Set([
  "source_id",
  "processing_script",
  "pipeline_version",
  "retrieved_at",
]);

/**
 * Filters the explorer offers, in reading order. Which of these actually
 * render is decided per dataset from the catalog's `filters` list, so a table
 * without an indicator dimension never shows an indicator box it could only
 * reject with a 400. Anything outside this curated list (district_code,
 * geography_level, …) stays reachable through the API and the search box.
 */
const FILTER_ORDER = [
  "period_code",
  "year",
  "season",
  "crop",
  "province",
  "district",
  "domain",
  "indicator_code",
] as const;

/** What the catalog still loading would have offered before indicator/domain. */
const FALLBACK_FILTERS: readonly string[] = ["year", "season", "crop", "province", "district"];

/**
 * URL for the CSV download of exactly the scope on screen: the applied search,
 * the active filters and the current sort travel with the link, so the export
 * matches the table instead of silently dumping the whole dataset.
 */
export function datasetCsvHref(
  key: string,
  search: string,
  filters: Record<string, string>,
  sortBy: string | null,
  sortDir: "asc" | "desc",
): string {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  if (sortBy) {
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);
  }
  return apiUrl(`/reports/dataset/${key}.csv`, params.toString());
}

/**
 * Data Explorer table (section M): exact-match filters the backend genuinely
 * supports, server-side sorting, page-size selector, column visibility with a
 * provenance toggle, reset, and an honest filtered row count. Provenance
 * columns stay reachable behind "Show provenance columns" — never deleted.
 */
export function DataTable({ datasetKey, label }: { datasetKey: string; label: string }) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showProvenance, setShowProvenance] = useState(false);

  // Reset local state when switching datasets.
  useEffect(() => {
    setApplied("");
    setSearch("");
    setOffset(0);
    setSortBy(null);
    setFilters({});
    setHiddenColumns(new Set());
    setShowProvenance(false);
  }, [datasetKey]);

  const query = useQuery({
    queryKey: ["dataset", datasetKey, applied, offset, pageSize, sortBy, sortDir, filters],
    queryFn: () =>
      api.dataset(datasetKey, pageSize, offset, applied, filters, sortBy, sortDir),
  });

  // Shared with the page's catalog query (same key), so this is cache, not a
  // second request: it says which exact-match filters this dataset accepts.
  const catalog = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
  const supportedFilters =
    catalog.data?.datasets.find((d) => d.key === datasetKey)?.filters ?? FALLBACK_FILTERS;
  const shownFilters = FILTER_ORDER.filter((f) => supportedFilters.includes(f));

  const total = query.data?.count ?? 0;
  const allColumns = query.data?.columns ?? [];
  const rows = query.data?.rows ?? [];

  // Provenance columns are hidden by default but stay reachable via the toggle.
  const visibleColumns = useMemo(
    () =>
      allColumns.filter((c) => {
        if (hiddenColumns.has(c)) return false;
        if (PROVENANCE_COLUMNS.has(c)) return showProvenance;
        return true;
      }),
    [allColumns, hiddenColumns, showProvenance],
  );

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const hasFilters = applied || Object.values(filters).some(Boolean) || sortBy;

  // One URL for the download, built from exactly the scope the table shows.
  const csvHref = datasetCsvHref(datasetKey, applied, filters, sortBy, sortDir);

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOffset(0);
  };

  const resetAll = () => {
    setSearch("");
    setApplied("");
    setOffset(0);
    setSortBy(null);
    setSortDir("asc");
    setFilters({});
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader title={label} subtitle={`Processed dataset · ${total} matching rows`} />

      {/* Filter row */}
      <div className="flex flex-wrap items-end gap-2 px-4 pb-2 pt-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className="input w-52 pl-8"
            placeholder="Search rows… (Enter)"
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

        {shownFilters.map((f) => (
          <label key={f} className="block">
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {f.replace(/_/g, " ")}
            </span>
            <input
              className="input w-28"
              placeholder={f === "period_code" ? "2025B" : f.replace(/_/g, " ")}
              value={filters[f] ?? ""}
              onChange={(e) => setFilter(f, e.target.value)}
              aria-label={`Filter by ${f.replace(/_/g, " ")}`}
            />
          </label>
        ))}

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
        {hasFilters ? (
          <button type="button" className="btn" onClick={resetAll}>
            Reset
          </button>
        ) : null}

        {/* Column visibility */}
        <details className="relative ml-auto">
          <summary className="btn cursor-pointer list-none select-none">Columns</summary>
          <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-forest/15 bg-white p-3 shadow-pop">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Visible columns
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {allColumns.map((c) => (
                <label key={c} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(c)}
                    onChange={(e) => {
                      setHiddenColumns((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(c);
                        else next.add(c);
                        return next;
                      });
                    }}
                  />
                  {c.replace(/_/g, " ")}
                </label>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 border-t border-forest/10 pt-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={showProvenance}
                onChange={(e) => setShowProvenance(e.target.checked)}
              />
              Show provenance columns
            </label>
          </div>
        </details>

        {/* The CSV download carries the scope on screen: search, filters and
            sort travel with the link, so the export matches the table instead
            of silently dumping the whole dataset. */}
        <a className="btn" href={csvHref} download>
          <Download className="h-3.5 w-3.5" /> CSV
        </a>
      </div>

      <div className="px-4 pb-4 pt-2">
        {query.isLoading ? (
          <TableSkeleton rows={8} />
        ) : query.error ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No rows match this search or filter."
            hint="Adjust the filters, or press Reset to see the full dataset."
          />
        ) : (
          <>
            <div className="thin-scroll max-h-[34rem] overflow-auto">
              <ResponsiveTable
                columns={visibleColumns.map(
                  (c): Column<Record<string, string | number | boolean | null>> => ({
                    id: c,
                    header: c.replace(/_/g, " "),
                    numeric:
                      typeof rows[0]?.[c] === "number" &&
                      !PROVENANCE_COLUMNS.has(c) &&
                      !["district", "province", "crop", "canonical_crop_name", "season"].includes(c),
                    sortable: true,
                    sortValue: (row) =>
                      typeof row[c] === "number" ? (row[c] as number) : row[c] === null ? null : String(row[c]),
                    cell: (row) => {
                      const value = row[c];
                      return value === null || value === undefined
                        ? "—"
                        : typeof value === "number"
                          ? fmtNumber(value, Number.isInteger(value) ? 0 : 3)
                          : typeof value === "boolean"
                            ? value
                              ? "true"
                              : "false"
                            : String(value);
                    },
                  }),
                )}
                rows={rows}
                rowKey={(row) => `${String(row["source_id"] ?? "r")}-${JSON.stringify(row).slice(0, 40)}`}
                sort={sortBy ? { id: sortBy, direction: sortDir } : null}
                onSortChange={(s) => {
                  setSortBy(s?.id ?? null);
                  setSortDir(s?.direction ?? "asc");
                  setOffset(0);
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span aria-live="polite">
                Showing {from}–{to} of {total}
                {Object.values(filters).some(Boolean) ? " (filtered)" : ""}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1">
                  <span>Rows per page</span>
                  <select
                    className="input h-7 w-fit py-0.5 text-xs"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setOffset(0);
                    }}
                    aria-label="Rows per page"
                  >
                    {[25, 50, 100, 250].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={to >= total}
                  onClick={() => setOffset(offset + pageSize)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <SourceNote>
        Source id: {query.data?.source_id ?? "—"}. Values come from the processed table. Filters are
        exact-match on columns the dataset supports; the API rejects anything else. Nulls are shown
        as “—”, never as 0.
      </SourceNote>
    </Card>
  );
}
