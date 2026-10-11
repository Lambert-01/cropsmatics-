"use client";

import { Check, ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SCOPE_HISTORY, scopeSummaryText, splitPeriod } from "@/lib/filters";
import { cn } from "@/lib/cn";
import { useCrops, useDistricts, usePeriods } from "@/services/hooks/useReference";
import { useFilters } from "@/services/hooks/useFilters";

/**
 * The professional analytics filter bar.
 *
 * Everything lives in the URL through `useFilters` — no duplicated filter state.
 * Province -> District cascades: picking a province narrows the district list,
 * and a district that is no longer valid is cleared automatically. A coverage
 * badge and per-filter applicability notes keep the data granularity honest
 * (section C): national datasets say which filters do not apply.
 */

export type FilterKey =
  | "period"
  | "year"
  | "season"
  | "crop"
  | "province"
  | "district"
  | "benchmark";
export type SupportedFilter = FilterKey | "all";

interface Props {
  /** Which filters are meaningful for this page's dataset. Default: all. */
  supported?: SupportedFilter | SupportedFilter[];
  /** Shown when a dataset does not support the standard filter set. */
  datasetNote?: string;
  /** Extra coverage line, e.g. "NATIONAL CONTEXT" for national-only datasets. */
  coverageLabel?: string;
  className?: string;
}

const DEFAULT_SUPPORTED: SupportedFilter[] = [
  "year",
  "season",
  "crop",
  "province",
  "district",
  "benchmark",
];

/* ------------------------------------------------------------------ */
/* Small primitives                                                    */
/* ------------------------------------------------------------------ */

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  disabledReason,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {disabled && disabledReason ? (
          <span className="ml-1 normal-case tracking-normal text-amber-600">· not applicable</span>
        ) : null}
      </span>
      <div className="relative">
        <select
          aria-label={label}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "input w-full appearance-none pr-8",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>
    </label>
  );
}

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  allLabel,
  emptyText = "No matches",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
  placeholder: string;
  /**
   * Text for the "clear this filter" entry. Overridden where the generic
   * `All {label}s` wording would be misleading - the period selector's empty
   * state is a scope ("All published periods"), not an unset selection.
   */
  allLabel?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? placeholder}`}
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={cn("truncate", !selected && "text-slate-400")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute z-40 mt-1 w-full min-w-56 overflow-hidden rounded-lg border border-forest/15 bg-white shadow-pop"
        >
          <div className="border-b border-forest/10 p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label.toLowerCase()}`}
                className="input h-8 w-full pl-7 text-sm"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="presentation">
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-forest/[0.05]",
                  !value && "font-semibold text-forest",
                )}
              >
                {allLabel ?? `All ${label.toLowerCase()}s`}
                {!value ? <Check className="h-3.5 w-3.5" /> : null}
              </button>
            </li>
            {filtered.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-forest/[0.05]",
                    o.value === value && "font-semibold text-forest",
                  )}
                >
                  <span className="truncate">
                    {o.label}
                    {o.hint ? (
                      <span className="ml-1.5 text-[11px] text-slate-400">{o.hint}</span>
                    ) : null}
                  </span>
                  {o.value === value ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400" role="presentation">
                {emptyText}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ActiveFilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-forest/20 bg-forest/[0.05] py-0.5 pl-2.5 pr-1 text-xs text-forest">
      <span className="text-slate-500">{label}:</span>
      <span className="max-w-40 truncate font-semibold">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter (${value})`}
        className="rounded-full p-0.5 hover:bg-forest/10"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AnalyticsFilterBar({
  supported = DEFAULT_SUPPORTED,
  datasetNote,
  coverageLabel,
  className,
}: Props) {
  const { filters, setFilters, reset } = useFilters();
  const { data: districts } = useDistricts();
  const { data: crops } = useCrops();
  const { data: periodsData } = usePeriods();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const supportedList = Array.isArray(supported) ? supported : [supported];
  const has = (f: SupportedFilter) =>
    supportedList.includes("all") || supportedList.includes(f);

  const periods = useMemo(() => periodsData?.periods ?? [], [periodsData]);
  const publishedCodes = useMemo(
    () => new Set(periods.map((p) => p.period_code)),
    [periods],
  );

  /**
   * The period selector is data-driven: only periods that genuinely carry rows
   * are offered, so an unpublished season (2026 Season C) can never be picked.
   * The option label names the season, e.g. "2026 Season B".
   */
  const periodOptions = useMemo(
    () =>
      periods.map((p) => ({
        value: p.period_code,
        label: p.label,
        hint: p.is_latest_district ? "latest district data" : undefined,
      })),
    [periods],
  );

  /** The canonical code for the current year+season selection, when published. */
  const selectedPeriod = filters.period ?? null;

  const cropOptions = useMemo(
    () =>
      (crops ?? []).map((c) => ({
        value: c.crop_name,
        label: c.crop_name,
        hint: c.category ?? undefined,
      })),
    [crops],
  );

  const provinceOptions = useMemo(() => {
    const provinces = new Set<string>();
    (districts ?? []).forEach((d) => {
      if (d.province) provinces.add(d.province);
    });
    return Array.from(provinces).sort().map((p) => ({ value: p, label: p }));
  }, [districts]);

  // Cascade: when a province is selected, only its districts are offered.
  const districtOptions = useMemo(() => {
    const list = districts ?? [];
    const inProvince = filters.province
      ? list.filter((d) => d.province === filters.province)
      : list;
    return inProvince
      .map((d) => ({ value: d.district, label: d.district, hint: d.province ?? undefined }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [districts, filters.province]);

  // If the selected district is not in the chosen province, clear it.
  useEffect(() => {
    if (!filters.district || !filters.province) return;
    const stillValid = (districts ?? []).some(
      (d) => d.district === filters.district && d.province === filters.province,
    );
    if (!stillValid) setFilters({ district: undefined });
  }, [filters.district, filters.province, districts, setFilters]);

  /**
   * Keep the canonical period and the legacy year/season pair in step.
   *
   * - A selected period always resolves to its year and season.
   * - A year+season pair that names an unpublished period is invalid, so the
   *   season is cleared automatically (e.g. 2026 Season C does not exist).
   * - A valid pair is canonicalised to its period code so period-aware
   *   endpoints receive ``period_code``.
   */
  useEffect(() => {
    if (periods.length === 0) return;
    if (filters.period) {
      const { year, season } = splitPeriod(filters.period);
      if (year && season && (filters.year !== year || filters.season !== season)) {
        setFilters({ year, season });
      }
      return;
    }
    if (filters.year && filters.season) {
      const code = `${filters.year}${filters.season}`;
      if (publishedCodes.has(code)) {
        setFilters({ period: code });
      } else {
        setFilters({ season: undefined });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.period, filters.year, filters.season, periods, publishedCodes]);

  const activeChips = useMemo(() => {
    const chips: { key: FilterKey; label: string; value: string }[] = [];
    const periodLabel =
      periods.find((p) => p.period_code === filters.period)?.label ?? filters.period;
    if (filters.period && periodLabel) {
      chips.push({ key: "period", label: "Period", value: periodLabel });
    } else if (filters.year || filters.season) {
      // Legacy link that named year/season without a period code.
      const legacy = [filters.year, filters.season && `Season ${filters.season}`]
        .filter(Boolean)
        .join(" ");
      if (legacy) chips.push({ key: "year", label: "Period", value: legacy });
    }
    if (filters.crop) chips.push({ key: "crop", label: "Crop", value: filters.crop });
    if (filters.province)
      chips.push({ key: "province", label: "Province", value: filters.province });
    if (filters.district)
      chips.push({ key: "district", label: "District", value: filters.district });
    if (filters.benchmark && filters.benchmark !== "national_crop_median")
      chips.push({ key: "benchmark", label: "Benchmark", value: filters.benchmark });
    return chips;
  }, [filters, periods]);

  const activeCount = activeChips.length;

  /** One-line human summary, e.g. "2026 Season B · Maize · Eastern · Bugesera". */
  const scopeSummary = useMemo(() => {
    const parts: string[] = [];
    const periodLabel =
      periods.find((p) => p.period_code === filters.period)?.label ??
      filters.period ??
      [filters.year, filters.season && `Season ${filters.season}`]
        .filter(Boolean)
        .join(" ");
    // Shared with the rest of the product rather than inline: this is the string
    // that decides whether a single-release figure reads as the selection or as
    // the whole published axis, so it is a tested function. The history scope's
    // snapshot is named by the panel that owns it (the Overview scope notice),
    // not here, because this bar never sees an overview response.
    parts.push(scopeSummaryText({ view: filters.view, periodLabel: periodLabel || null }));
    parts.push(filters.crop ?? "All crops");
    if (filters.province) parts.push(filters.province);
    parts.push(filters.district ?? "All districts");
    return parts.join(" · ");
  }, [filters, periods]);

  const coverageBadgeText = coverageLabel ?? null;

  /**
   * `view` is writable but is deliberately not a `SupportedFilter`: a page never
   * "supports" the scope, it either has a period dimension or it does not. The
   * scope still belongs in the same patch so a period and its scope are never
   * written as two separate URL updates.
   */
  const set = (
    patch: Partial<Record<FilterKey | "view", string | number | undefined>>,
  ) => setFilters(patch as never);

  /* ------------------------------------------------------------- */
  /* Filter controls — shared between desktop bar and mobile drawer */
  /* ------------------------------------------------------------- */
  const controls = (idsPrefix: string) => (
    <>
      {has("year") || has("season") ? (
        <SearchableSelect
          label="Period"
          value={selectedPeriod ?? ""}
          onChange={(v) =>
            v
              ? // A release is named, so the scope is that release. Any explicit
                // `view` is cleared rather than left to contradict it in the URL.
                set({ period: v, year: undefined, season: undefined, view: undefined })
              : // "All published periods" is a scope, not an empty selection, so it
                // is written down. Otherwise a stored default period would quietly
                // re-apply and the page would come back on a different scope.
                set({
                  period: undefined,
                  year: undefined,
                  season: undefined,
                  view: SCOPE_HISTORY,
                })
          }
          options={periodOptions}
          placeholder="All published periods"
          allLabel="All published periods"
          emptyText="No published periods"
          className={idsPrefix === "m" ? "flex-1" : undefined}
        />
      ) : null}

      {has("crop") ? (
        <SearchableSelect
          label="Crop"
          value={filters.crop ?? ""}
          onChange={(v) => set({ crop: v || undefined })}
          options={cropOptions}
          placeholder="All crops"
          className={idsPrefix === "m" ? "flex-1" : undefined}
        />
      ) : null}

      {has("province") ? (
        <FilterSelect
          label="Province"
          value={filters.province ?? ""}
          onChange={(v) => set({ province: v || undefined })}
          options={[
            { value: "", label: "All provinces" },
            ...provinceOptions.map((p) => ({ value: p.value, label: p.label })),
          ]}
          className={idsPrefix === "m" ? "flex-1" : undefined}
        />
      ) : null}

      {has("district") ? (
        <SearchableSelect
          label="District"
          value={filters.district ?? ""}
          onChange={(v) => set({ district: v || undefined })}
          options={districtOptions}
          placeholder="All districts"
          className={idsPrefix === "m" ? "flex-1" : undefined}
        />
      ) : null}

      {has("benchmark") ? (
        <FilterSelect
          label="Benchmark"
          value={filters.benchmark ?? "national_crop_median"}
          onChange={(v) => set({ benchmark: v })}
          options={[
            { value: "national_crop_median", label: "National crop median" },
            { value: "national_crop_season_median", label: "National crop-season median" },
            {
              value: "top_quartile_comparable_districts",
              label: "Top-quartile comparable districts",
            },
            { value: "agro_ecological_peer_group", label: "Agro-ecological peer group" },
          ]}
          className={idsPrefix === "m" ? "flex-1" : undefined}
        />
      ) : null}
    </>
  );

  const controlsNode = controls("d");

  return (
    <section aria-label="Analytics filters" className={cn("space-y-2", className)}>
      {/* Desktop / tablet bar */}
      <div className="card hidden items-end gap-3 px-4 py-3 md:flex">
        {controlsNode}
        <div className="ml-auto flex shrink-0 items-center gap-2 pb-0.5">
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={reset}
              className="btn text-xs"
              aria-label="Reset all filters"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
            </button>
          ) : null}
          {coverageBadgeText ? (
            <span className="rounded-full border border-info/30 bg-info/[0.08] px-2.5 py-1 text-[10px] font-bold tracking-wide text-info">
              {coverageBadgeText}
            </span>
          ) : null}
        </div>
      </div>

      {/* Mobile: Filter button + drawer */}
      <div className="card flex items-center justify-between px-3 py-2.5 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="btn btn-primary relative"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
          {activeCount > 0 ? (
            <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[11px] font-bold">
              {activeCount}
            </span>
          ) : null}
        </button>
        {coverageBadgeText ? (
          <span className="rounded-full border border-info/30 bg-info/[0.08] px-2 py-0.5 text-[10px] font-bold tracking-wide text-info">
            {coverageBadgeText}
          </span>
        ) : null}
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div
            className="absolute inset-0 bg-forest-deep/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-pop">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-forest-deep">Filters</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="rounded-lg p-1.5 hover:bg-forest/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-3">{controls("m")}</div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={reset} className="btn flex-1">
                <RotateCcw className="h-3.5 w-3.5" /> Reset all
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="btn btn-primary flex-1"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Active filter chips + scope summary (all screens) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        {activeChips.map((chip) => (
          <ActiveFilterChip
            key={chip.key}
            label={chip.label}
            value={chip.value}
            onRemove={() =>
              chip.key === "period" || chip.key === "year"
                ? // Clearing the period clears the derived year/season with it.
                  set({ period: undefined, year: undefined, season: undefined })
                : set({ [chip.key]: undefined } as never)
            }
          />
        ))}
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-forest hover:underline"
          >
            Clear all
          </button>
        ) : null}
        <p className="ml-auto text-[11px] font-medium text-slate-500" aria-live="polite">
          {scopeSummary}
        </p>
      </div>

      {/* Granularity honesty (section C): never silently ignore filters. */}
      {datasetNote ? (
        <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-amber-700">
          <span aria-hidden="true">ⓘ</span>
          {datasetNote}
        </p>
      ) : null}
    </section>
  );
}
