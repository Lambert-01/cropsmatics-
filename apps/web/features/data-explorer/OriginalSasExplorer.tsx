"use client";

import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { api } from "@/lib/api";
import { fmtNumber } from "@/lib/format";

type Availability = "full extract" | "inventory only";

function cellLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

/**
 * Source-faithful SAS worksheet browser. This intentionally does not reuse
 * DataTable: the processed explorer has named analytical columns, while this
 * view must preserve the original worksheet's cell grid and row order.
 */
export function OriginalSasExplorer() {
  const [release, setRelease] = useState("");
  const [availability, setAvailability] = useState<Availability | "">("");
  const [mapped, setMapped] = useState<"" | "true" | "false">("");
  const [selectedKey, setSelectedKey] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const listQuery = useQuery({
    queryKey: ["original-sources", release, availability, mapped],
    queryFn: () =>
      api.originalSources({
        release: release || undefined,
        availability: availability || undefined,
        mapped: mapped === "" ? undefined : mapped === "true",
      }),
  });
  const sources = listQuery.data?.sources ?? [];

  // Keep a valid worksheet selected after an automatic filter change.
  useEffect(() => {
    if (sources.length && !sources.some((source) => source.key === selectedKey)) {
      setSelectedKey(sources[0].key);
      setOffset(0);
      setAppliedSearch("");
      setSearch("");
    }
  }, [selectedKey, sources]);

  const selected = useMemo(
    () => sources.find((source) => source.key === selectedKey) ?? null,
    [selectedKey, sources],
  );
  const detailQuery = useQuery({
    queryKey: ["original-source", selectedKey, pageSize, offset, appliedSearch],
    queryFn: () => api.originalSource(selectedKey, pageSize, offset, appliedSearch),
    enabled: Boolean(selected?.has_extract),
  });
  const detail = detailQuery.data;
  const total = detail?.count ?? selected?.rows ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const sourceDownloadHref = selected?.has_extract ? api.originalSourceDownloadHref(selected.key) : null;
  const filterOptions = listQuery.data?.filter_options ?? {};

  const setSource = (key: string) => {
    setSelectedKey(key);
    setOffset(0);
    setSearch("");
    setAppliedSearch("");
  };

  const reset = () => {
    setRelease("");
    setAvailability("");
    setMapped("");
    setSearch("");
    setAppliedSearch("");
    setOffset(0);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Original SAS source archive"
          subtitle="Worksheet cells as extracted from the retained NISR source workbooks"
        />
        <CardBody className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-forest/10 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Matching worksheets</p>
              <p className="mt-1 text-lg font-semibold text-forest-deep">
                {fmtNumber(listQuery.data?.count ?? 0, 0)}
              </p>
            </div>
            <div className="rounded-lg border border-forest/10 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Full cell extracts</p>
              <p className="mt-1 text-lg font-semibold text-forest-deep">
                {fmtNumber(listQuery.data?.available_extract_count ?? 0, 0)}
              </p>
            </div>
            <div className="rounded-lg border border-forest/10 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Inventory only</p>
              <p className="mt-1 text-lg font-semibold text-forest-deep">
                {fmtNumber(listQuery.data?.inventory_only_count ?? 0, 0)}
              </p>
            </div>
          </div>

          <p className="max-w-4xl text-xs leading-relaxed text-slate-600">
            This is the source view, not a normalized analytical table. Blank cells, worksheet headers,
            spacer rows and the original row order are retained. Inventory-only entries remain visible
            for auditability, but their cell files are not included in this deployment.
          </p>

          {listQuery.error ? (
            <ErrorState message={(listQuery.error as Error).message} onRetry={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableSkeleton rows={5} />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block min-w-0">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Release
                  </span>
                  <select
                    className="input w-full"
                    value={release}
                    onChange={(event) => {
                      setRelease(event.target.value);
                      setOffset(0);
                    }}
                    aria-label="Filter original sources by release"
                  >
                    <option value="">All releases</option>
                    {(filterOptions.release ?? []).map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Availability
                  </span>
                  <select
                    className="input w-full"
                    value={availability}
                    onChange={(event) => {
                      setAvailability(event.target.value as Availability | "");
                      setOffset(0);
                    }}
                    aria-label="Filter original sources by availability"
                  >
                    <option value="">All source records</option>
                    {(filterOptions.availability ?? []).map((value) => (
                      <option key={value} value={value}>{value === "full extract" ? "Full cell extract" : "Inventory only"}</option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Mapping status
                  </span>
                  <select
                    className="input w-full"
                    value={mapped}
                    onChange={(event) => {
                      setMapped(event.target.value as "" | "true" | "false");
                      setOffset(0);
                    }}
                    aria-label="Filter original sources by mapping status"
                  >
                    <option value="">All mapping states</option>
                    <option value="true">Mapped to analytics</option>
                    <option value="false">Not mapped to analytics</option>
                  </select>
                </label>
                <button type="button" className="btn self-end" onClick={reset} disabled={!release && !availability && !mapped}>
                  Reset filters
                </button>
              </div>

              <label className="block">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Original worksheet
                </span>
                <select
                  className="input w-full"
                  value={selectedKey}
                  onChange={(event) => setSource(event.target.value)}
                  aria-label="Select an original SAS worksheet"
                >
                  {sources.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.release} · {source.source_workbook} · {source.sheet_name.trim()}
                      {source.has_extract ? "" : " · inventory only"}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </CardBody>
      </Card>

      {selected ? (
        <Card className="overflow-hidden">
          <CardHeader
            title={selected.sheet_name.trim() || "Original worksheet"}
            subtitle={`${selected.release} · ${selected.source_workbook} · ${selected.rows} source rows × ${selected.columns} source columns`}
            action={
              sourceDownloadHref ? (
                <a className="btn" href={sourceDownloadHref} download>
                  <Download className="h-3.5 w-3.5" />
                  {selected.source_format === "xlsx" ? "Original XLSX" : "Worksheet CSV"}
                </a>
              ) : null
            }
          />

          <div className="grid gap-x-5 gap-y-2 border-b border-forest/10 px-4 pb-3 pt-3 text-[11px] text-slate-600 sm:grid-cols-[auto_1fr_auto_1fr]">
            <span className="font-semibold text-forest-deep">Source</span>
            <span className="break-words">{selected.source_id}</span>
            <span className="font-semibold text-forest-deep">Used range</span>
            <span>{selected.used_range ?? "Not recorded"}</span>
            <span className="font-semibold text-forest-deep">Status</span>
            <span>{selected.mapped ? "Mapped to an analytical output" : "Retained for source review"}</span>
            <span className="font-semibold text-forest-deep">Archive path</span>
            <span className="break-words">{selected.raw_path ?? "Cell extract not included"}</span>
          </div>

          {!selected.has_extract ? (
            <div className="p-4">
              <EmptyState
                title="Worksheet inventory is available; cells are not deployed."
                hint={selected.exclusion_reason ?? "The original workbook cell extract is not present in the deployable archive."}
                icon={<FileSpreadsheet className="h-5 w-5" />}
              />
            </div>
          ) : (
            <>
              <div className="space-y-3 border-b border-forest/10 px-4 pb-3 pt-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block min-w-0 flex-1 sm:min-w-64">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Search original cells
                    </span>
                    <span className="relative block">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        className="input w-full pl-8"
                        placeholder="Search cells, then press Enter"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            setAppliedSearch(search);
                            setOffset(0);
                          }
                        }}
                        aria-label="Search original worksheet cells"
                      />
                    </span>
                  </label>
                  <label className="block w-28">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rows</span>
                    <select
                      className="input w-full"
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        setOffset(0);
                      }}
                      aria-label="Rows per page"
                    >
                      {[50, 100, 250, 500].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="px-4 pb-4 pt-2">
                {detailQuery.isLoading ? (
                  <TableSkeleton rows={8} />
                ) : detailQuery.error ? (
                  <ErrorState message={(detailQuery.error as Error).message} onRetry={() => detailQuery.refetch()} />
                ) : !detail?.rows.length ? (
                  <EmptyState title="No original cells match this search." hint="Clear the search and press Enter to restore the worksheet." />
                ) : (
                  <>
                    <div className="thin-scroll max-h-[38rem] overflow-auto rounded-lg border border-forest/10">
                      <table className="data-explorer-source-table min-w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-forest-deep text-white">
                          <tr>
                            <th className="w-12 border-r border-white/15 px-2 py-2 text-center font-semibold">#</th>
                            {detail.columns.map((column, index) => (
                              <th key={column} className="min-w-28 border-r border-white/15 px-2 py-2 font-semibold">
                                {column || cellLabel(index)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.rows.map((row, rowIndex) => (
                            <tr key={`${offset + rowIndex}-${row.join("|")}`} className="even:bg-forest/[0.025]">
                              <td className="border-r border-t border-forest/10 px-2 py-1.5 text-center text-[10px] text-slate-400">{offset + rowIndex + 1}</td>
                              {detail.columns.map((column, columnIndex) => (
                                <td key={`${column}-${columnIndex}`} className="max-w-72 whitespace-pre-wrap border-r border-t border-forest/10 px-2 py-1.5 align-top text-slate-700">
                                  {row[columnIndex] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{from}–{to} of {fmtNumber(total, 0)} matching source rows</span>
                      <div className="flex items-center gap-2">
                        <button type="button" className="btn" onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={offset === 0} aria-label="Previous source rows">
                          <ChevronLeft className="h-3.5 w-3.5" /> Previous
                        </button>
                        <button type="button" className="btn" onClick={() => setOffset(offset + pageSize)} disabled={offset + pageSize >= total} aria-label="Next source rows">
                          Next <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </Card>
      ) : !listQuery.isLoading && !listQuery.error ? (
        <EmptyState title="No original source records match these filters." hint="Reset the source filters to see the retained archive." />
      ) : null}
    </div>
  );
}
