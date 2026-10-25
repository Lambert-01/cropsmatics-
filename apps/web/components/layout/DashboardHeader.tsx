"use client";

import { Menu, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SCOPE_HISTORY } from "@/lib/filters";
import { useLanguage } from "@/lib/i18n";
import { buildSuggestions } from "@/lib/search";
import { useFilters } from "@/services/hooks/useFilters";
import { useCrops, useDatasets, useDistricts } from "@/services/hooks/useReference";

/**
 * The global chrome: menu, search, the active scope, and language.
 *
 * It deliberately holds **no period/crop/district selectors**. Those duplicate
 * the filter bar every analytical page already renders, and worse, the two could
 * disagree: the header wrote the shared filter state while the page's own bar
 * rendered from the same state with different controls. Analytical filtering
 * belongs to the analytical page. What the header shows instead is a read-only
 * summary of the scope that *is* active, so a reader always knows what they are
 * looking at without a second set of inputs.
 *
 * Notification and profile controls were removed rather than left as decoration:
 * there is no notification system and no signed-in profile, so both buttons did
 * nothing when clicked.
 */
export function DashboardHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const router = useRouter();
  const { filters, reset } = useFilters();
  const { lang, setLang, t } = useLanguage();
  const { data: districts } = useDistricts();
  const { data: crops } = useCrops();
  const { data: datasetList } = useDatasets();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(
    () =>
      buildSuggestions({
        query: search,
        crops: (crops ?? []).map((crop) => ({ name: crop.crop_name })),
        districts: (districts ?? []).map((district) => ({ name: district.district })),
        datasets: (datasetList?.datasets ?? []).map((dataset) => ({
          key: dataset.key,
          label: dataset.label,
        })),
      }),
    [search, crops, districts, datasetList],
  );

  const scope = [
    // The period slot is never blank: the header states the scope even when it is
    // "all published periods", so an unselected release is never left implied.
    filters.view === SCOPE_HISTORY ? "All published periods" : filters.period,
    filters.crop,
    filters.district,
  ].filter((part): part is string => Boolean(part));

  function go(href: string) {
    setSearch("");
    setOpen(false);
    router.push(href);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-forest/10 bg-white/90 backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onOpenNav}
          className="btn lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Search: navigates to a real destination rather than mutating filters. */}
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
              } else if (event.key === "Enter" && suggestions[0]) {
                go(suggestions[0].href);
              }
            }}
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls="global-search-results"
            className="input w-full max-w-md pl-8"
          />
          {open && search.trim().length >= 2 ? (
            <ul
              id="global-search-results"
              role="listbox"
              aria-label={t("search.results")}
              className="absolute z-30 mt-1 w-full max-w-md overflow-hidden rounded-lg border border-forest/10 bg-white shadow-pop"
            >
              {suggestions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">{t("search.noResults")}</li>
              ) : (
                suggestions.map((suggestion) => (
                  <li key={`${suggestion.kind}-${suggestion.value}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-forest/[0.04]"
                      onClick={() => go(suggestion.href)}
                    >
                      <span className="truncate text-slate-700">{suggestion.label}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                        {t(`search.kind.${suggestion.kind}`)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Active scope, read-only: what the numbers on screen actually cover. */}
          {scope.length ? (
            <div className="hidden items-center gap-1.5 rounded-lg border border-forest/15 bg-forest/[0.03] px-2.5 py-1.5 md:flex">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("header.scope")}
              </span>
              <span className="max-w-[22rem] truncate text-xs font-medium text-slate-700">
                {scope.join(" · ")}
              </span>
              <button
                type="button"
                onClick={reset}
                aria-label={t("header.clearScope")}
                title={t("header.clearScope")}
                className="rounded p-0.5 text-slate-400 hover:bg-forest/10 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {/* Colour scheme */}
          <ThemeToggle />

          {/* Language */}
          <div
            role="group"
            aria-label="Language"
            className="flex overflow-hidden rounded-lg border border-forest/15 bg-white text-xs"
          >
            {(["en", "rw", "fr"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`px-2 py-1.5 font-medium uppercase ${
                  lang === code ? "bg-primary text-white" : "text-slate-500 hover:bg-forest/5"
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
