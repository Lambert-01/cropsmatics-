"use client";

import { ArrowDown, ArrowUp, Bookmark, ChevronRight, Minus, RefreshCw, Search, Snowflake, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { PageHero } from "@/components/layout/PageHero";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import {
  cropAvailability,
  cropCategories,
  cropSummaries,
  filterCrops,
  groupCropsByCategory,
  loadSavedCrops,
  saveSavedCrops,
  toggleSavedCrop,
} from "@/features/crops/catalog";
import { fmtCompact, fmtNumber, fmtPct } from "@/lib/format";
import { useNationalBoard } from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";
import { useCrops } from "@/services/hooks/useReference";
import type { NationalBoardCrop } from "@/types";

/**
 * Crop catalogue — the entry point to the per-crop Crop Intelligence workspace.
 *
 * It lists only the crops the API publishes, grouped by the category the
 * catalogue carries: no crop is invented, and a crop with no published rows
 * simply does not appear.
 *
 * Finding a crop is the page's whole job, so it leads with search rather than
 * with a wall of category cards. The search reads both languages: the same
 * entry answers to "Maize" and to "Ibigori".
 *
 * Three additions make it an analytical catalogue rather than a link list:
 *
 * - a compact **period scope** (all published periods, or one release) that is
 *   URL-backed like every other page, so a scoped catalogue is shareable;
 * - **summaries** — production, harvested area and yield from the national
 *   board, requested from the server for that scope. Every value, its period
 *   and its same-season change are the API's own; the page formats them and
 *   never derives one. A metric the release did not tabulate renders as "not
 *   published", never as a zero;
 * - **saved crops** — bookmarked on this device, with a one-click scope, so a
 *   cooperative can keep its crops one interaction away.
 *
 * There is deliberately no "sort by yield": crops have different natural yield
 * scales, so ranking them on one axis would compare incomparable values.
 */
export default function CropCataloguePage() {
  const { filters } = useFilters();
  const { data: cropList, error, isLoading, refetch } = useCrops();
  const board = useNationalBoard(filters);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [savedScope, setSavedScope] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Saved crops live in localStorage; they hydrate after mount so the first
  // server-rendered paint never disagrees with the client render, and are only
  // written back once hydration has happened — otherwise the initial empty
  // state would overwrite a real saved list on its way in.
  useEffect(() => {
    setSaved(loadSavedCrops(window.localStorage));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) saveSavedCrops(window.localStorage, saved);
  }, [saved, hydrated]);

  const scopedCatalogue = useMemo(() => {
    // A single-period board is the authoritative coverage scope for this page.
    // Season C releases publish fewer crops, so do not label the full catalogue
    // as published when the selected release has no row for a crop.
    if (!board.data || board.data.periods.length !== 1 || !cropList) return cropList ?? [];
    const published = new Set(
      board.data.crops
        .filter((row) => row.n_published_periods > 0)
        .map((row) => row.crop.toLowerCase()),
    );
    return cropList.filter((crop) => published.has(crop.crop_name.toLowerCase()));
  }, [board.data, cropList]);
  const categories = useMemo(() => cropCategories(scopedCatalogue), [scopedCatalogue]);
  const matches = useMemo(() => {
    const found = filterCrops(scopedCatalogue, { query, category });
    return savedScope ? found.filter((crop) => saved.includes(crop.crop_code)) : found;
  }, [scopedCatalogue, query, category, savedScope, saved]);
  const groups = useMemo(() => groupCropsByCategory(matches), [matches]);
  const total = scopedCatalogue.length;
  const savedCount = useMemo(
    () => (cropList ?? []).filter((crop) => saved.includes(crop.crop_code)).length,
    [cropList, saved],
  );
  const narrowed = Boolean(query.trim() || category || savedScope);

  /** Board rows keyed by lower-case crop name (the board's join key). */
  const boardByCrop = useMemo(() => {
    const map = new Map<string, NationalBoardCrop>();
    (board.data?.crops ?? []).forEach((row) => map.set(row.crop.toLowerCase(), row));
    return map;
  }, [board.data]);

  const units = board.data?.metric_units ?? {};
  const axisLength = board.data?.periods.length ?? 0;

  const summaryNotice = board.error
    ? `Summaries unavailable: ${(board.error as Error).message}`
    : null;

  return (
    <div className="space-y-5">
      <PageHero
        title="Crop Intelligence"
        subtitle="Open any published crop for its productivity, geographic distribution and post-harvest profile."
      />

      {/* Period scope: same URL-backed control as every other page. The board
          is national, so district/province filters are deliberately absent and
          the note says where district detail lives instead of silently
          dropping a filter. */}
      <AnalyticsFilterBar
        supported={["year", "season"]}
        coverageLabel="NATIONAL"
        datasetNote="Crop summaries are published national figures. District-level detail lives on each crop's page — this dataset has no district dimension to filter on."
      />

      {error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}

      {isLoading ? <TableSkeleton rows={6} /> : null}

      {!isLoading && total > 0 ? (
        <div className="card flex flex-wrap items-end gap-3 p-3">
          <label className="min-w-56 flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Search crops
            </span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="English or Kinyarwanda name…"
                aria-label="Search crops by English or Kinyarwanda name"
                className="input w-full pl-8"
              />
            </span>
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Category
            </span>
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="input w-auto"
            >
              <option value="">All categories</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          {/* Saved-crop scope: bookmarked crops, one interaction away. */}
          <button
            type="button"
            onClick={() => setSavedScope((value) => !value)}
            aria-pressed={savedScope}
            className={`btn mb-0.5 text-xs ${savedScope ? "btn-primary" : ""}`}
            title={
              savedCount
                ? "Show only the crops you bookmarked on this device"
                : "Bookmark crops with the ribbon on any row"
            }
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            {savedCount ? `Saved · ${savedCount}` : "Saved"}
          </button>

          {/* The count is the honest answer to "did my search work?". */}
          <p className="pb-2 text-xs text-slate-500" aria-live="polite">
            {narrowed ? `${matches.length} of ${total} published crops` : `${total} published crops`}
          </p>

          {narrowed ? (
            <button
              type="button"
              className="btn mb-0.5 text-xs"
              onClick={() => {
                setQuery("");
                setCategory("");
                setSavedScope(false);
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Summaries come from a second request; its failure must not hide the
          catalogue, so it degrades to a one-line notice with a retry. */}
      {summaryNotice ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber/30 bg-amber/[0.06] px-3 py-2 text-xs text-amber-800">
          <span className="min-w-0 truncate">{summaryNotice}</span>
          <button
            type="button"
            className="btn shrink-0 text-xs"
            onClick={() => board.refetch()}
            aria-label="Retry crop summaries"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        </div>
      ) : null}

      {isLoading ? null : total === 0 ? (
        <EmptyState
          title="No crops are published."
          hint="The crop catalogue is empty. Build the processed tables and check that the API is running."
        />
      ) : matches.length === 0 && savedScope && !query.trim() && !category ? (
        <EmptyState
          title="No saved crops yet."
          hint="Use the ribbon on any crop row to bookmark it on this device — it will appear here."
        />
      ) : matches.length === 0 ? (
        <EmptyState
          title={`No published crop matches this search.`}
          hint="Try the Kinyarwanda name, or clear the category filter."
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
              {group.items.map((crop) => {
                const row = boardByCrop.get(crop.crop_name.toLowerCase());
                const availability = board.data
                  ? cropAvailability(row, axisLength)
                  : null;
                const summaries = cropSummaries(row, units);
                const isSaved = saved.includes(crop.crop_code);
                return (
                  <li key={crop.crop_code} className="flex items-stretch">
                    <Link
                      href={`/crops/${encodeURIComponent(crop.crop_code)}`}
                      className="min-w-0 flex-1 px-4 py-2.5 transition hover:bg-forest/[0.03]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-forest">{crop.crop_name}</span>
                        {crop.kinyarwanda_name ? (
                          <span className="truncate text-xs text-slate-400">
                            {crop.kinyarwanda_name}
                          </span>
                        ) : null}
                        {crop.cold_chain_recommended ? (
                          <Snowflake
                            className="h-3.5 w-3.5 shrink-0 text-info"
                            aria-label="Cold chain recommended"
                          />
                        ) : null}
                        {availability ? (
                          <span
                            className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              availability.published
                                ? "bg-forest/[0.07] text-forest"
                                : "bg-slate-100 text-slate-500"
                            }`}
                            title={
                              availability.published
                                ? undefined
                                : "This crop has no published national series for the selected scope"
                            }
                          >
                            {availability.text}
                          </span>
                        ) : null}
                      </span>

                      {/* Summary line: the server's own values, formatted. */}
                      {board.data && row ? (
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {summaries.map((metric) => (
                            <span
                              key={metric.metric}
                              className="inline-flex items-baseline gap-1 text-[11px] text-slate-500"
                              title={
                                metric.value === null
                                  ? `${metric.label}: ${metric.changeReason ?? "not published for this scope"}`
                                  : `${metric.label} · ${metric.periodLabel ?? ""}`
                              }
                            >
                              <span className="font-medium text-slate-400">{metric.label}</span>
                              {metric.value === null ? (
                                <span className="text-slate-400">not published</span>
                              ) : (
                                <>
                                  <span className="font-semibold text-slate-700">
                                    {metric.metric === "yield_mt_ha"
                                      ? fmtNumber(metric.value, 2)
                                      : fmtCompact(metric.value)}
                                  </span>
                                  <span className="text-slate-400">{metric.unit}</span>
                                  <ChangeTag
                                    pct={metric.changePct}
                                    available={metric.changeAvailable}
                                    reason={metric.changeReason}
                                  />
                                </>
                              )}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </Link>

                    {/* Bookmark lives beside the link, never inside it, so the
                        row stays one honest anchor plus one honest button. */}
                    <button
                      type="button"
                      onClick={() => setSaved((current) => toggleSavedCrop(current, crop.crop_code))}
                      aria-pressed={isSaved}
                      aria-label={isSaved ? `Unsave ${crop.crop_name}` : `Save ${crop.crop_name}`}
                      title={isSaved ? "Remove from saved crops" : "Save this crop on this device"}
                      className="shrink-0 self-center rounded-lg p-2 text-slate-400 transition hover:bg-forest/[0.06] hover:text-forest"
                    >
                      <Bookmark
                        className={`h-4 w-4 ${isSaved ? "fill-forest text-forest" : ""}`}
                        aria-hidden="true"
                      />
                    </button>

                    <span
                      className="self-center pr-3 text-slate-400"
                      aria-hidden="true"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * The same-season delta, as a compact arrow tag.
 *
 * An unavailable comparison shows nothing rather than a 0 %: the server
 * already decided it cannot be made, and inventing a neutral "0%" would read
 * as "no change happened".
 */
function ChangeTag({
  pct,
  available,
  reason,
}: {
  pct: number | null;
  available: boolean;
  reason: string | null;
}) {
  if (!available || pct === null) {
    return reason ? (
      <span className="text-slate-300" title={reason}>
        ·
      </span>
    ) : null;
  }
  if (Math.abs(pct) < 0.05) {
    return (
      <span className="inline-flex items-center gap-0.5 text-slate-400" title="No material change">
        <Minus className="h-3 w-3" aria-hidden="true" />
        {fmtPct(pct, 1)}
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${
        up ? "text-success" : "text-danger"
      }`}
      title="Same-season change: this release versus the same season one year earlier"
    >
      {up ? (
        <ArrowUp className="h-3 w-3" aria-hidden="true" />
      ) : (
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
      )}
      {fmtPct(Math.abs(pct), 1)}
    </span>
  );
}
