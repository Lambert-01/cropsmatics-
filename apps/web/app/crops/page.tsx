"use client";

import { ChevronRight, Search, Snowflake, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHero } from "@/components/layout/PageHero";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import {
  cropCategories,
  filterCrops,
  groupCropsByCategory,
} from "@/features/crops/catalog";
import { useCrops } from "@/services/hooks/useReference";

/**
 * Crop catalogue.
 *
 * The entry point to the per-crop Crop Intelligence workspace. It lists only the
 * crops the API publishes, grouped by the category the catalogue carries — no
 * crop is invented, and a crop with no published rows simply does not appear.
 *
 * Finding a crop is the page's whole job, so it leads with search rather than
 * with a wall of category cards. The search reads both languages: the same entry
 * answers to "Maize" and to "Ibigori", which is what a Kinyarwanda-speaking user
 * expects from a Kinyarwanda catalogue.
 *
 * There is deliberately no "sort by yield". Crops have different natural yield
 * scales, so ranking them on one axis would compare incomparable values.
 */
export default function CropCataloguePage() {
  const { data: cropList, error, isLoading, refetch } = useCrops();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");

  const categories = useMemo(() => cropCategories(cropList), [cropList]);
  const matches = useMemo(
    () => filterCrops(cropList, { query, category }),
    [cropList, query, category],
  );
  const groups = useMemo(() => groupCropsByCategory(matches), [matches]);
  const total = cropList?.length ?? 0;
  const narrowed = Boolean(query.trim() || category);

  return (
    <div className="space-y-5">
      <PageHero
        title="Crop Intelligence"
        subtitle="Open any published crop for its productivity, geographic distribution and post-harvest profile."
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

          {/* The count is the honest answer to "did my search work?". */}
          <p className="pb-2 text-xs text-slate-500" aria-live="polite">
            {narrowed
              ? `${matches.length} of ${total} published crops`
              : `${total} published crops`}
          </p>

          {narrowed ? (
            <button
              type="button"
              className="btn mb-0.5 text-xs"
              onClick={() => {
                setQuery("");
                setCategory("");
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
            </button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? null : total === 0 ? (
        <EmptyState
          title="No crops are published."
          hint="The crop catalogue is empty. Build the processed tables and check that the API is running."
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
