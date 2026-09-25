"use client";

import { Bell, Menu, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { useLanguage } from "@/lib/i18n";
import { SEASONS } from "@/lib/constants";
import { useFilters } from "@/services/hooks/useFilters";
import { useCrops, useDistricts, useCoverage } from "@/services/hooks/useReference";

export function DashboardHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const { filters, setFilters } = useFilters();
  const { lang, setLang, t } = useLanguage();
  const { data: districts } = useDistricts();
  const { data: crops } = useCrops();
  const { data: coverage } = useCoverage();
  const [search, setSearch] = useState("");

  // Only offer years that genuinely appear in the coverage matrix.
  const years = useMemo(() => {
    const keys = Object.keys(coverage?.coverage?.district_crop_productivity ?? {});
    const national = Object.keys(coverage?.coverage?.national_crop_trends ?? {});
    const set = new Set<string>();
    [...keys, ...national].forEach((k) => {
      const m = /^(\d{4})/.exec(k);
      if (m) set.add(m[1]);
    });
    return Array.from(set).sort();
  }, [coverage]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const d = (districts ?? []).filter((x) => x.district.toLowerCase().includes(q));
    const c = (crops ?? []).filter((x) => x.crop_name.toLowerCase().includes(q));
    return [
      ...d.slice(0, 4).map((x) => ({ kind: "district" as const, value: x.district })),
      ...c.slice(0, 4).map((x) => ({ kind: "crop" as const, value: x.crop_name })),
    ];
  }, [search, districts, crops]);

  const hasFilters =
    filters.year || filters.season || filters.crop || filters.province || filters.district;

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

        {/* Search */}
        <div className="relative hidden min-w-0 flex-1 sm:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            className="input w-full max-w-md pl-8"
          />
          {suggestions.length > 0 ? (
            <ul className="absolute z-30 mt-1 w-full max-w-md overflow-hidden rounded-lg border border-forest/10 bg-white shadow-pop">
              {suggestions.map((s) => (
                <li key={`${s.kind}-${s.value}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-forest/[0.04]"
                    onClick={() => {
                      setFilters(s.kind === "district" ? { district: s.value } : { crop: s.value });
                      setSearch("");
                    }}
                  >
                    <span className="text-slate-700">{s.value}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {s.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Year */}
          <select
            aria-label="Year"
            className="input hidden sm:block"
            value={filters.year ?? ""}
            onChange={(e) => setFilters({ year: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">{t("header.all")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Season */}
          <select
            aria-label={t("header.season")}
            className="input"
            value={filters.season ?? ""}
            onChange={(e) => setFilters({ season: e.target.value || undefined })}
          >
            <option value="">{t("header.season")}</option>
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Crop */}
          <select
            aria-label={t("header.crop")}
            className="input hidden md:block max-w-[10rem]"
            value={filters.crop ?? ""}
            onChange={(e) => setFilters({ crop: e.target.value || undefined })}
          >
            <option value="">{t("header.crop")}</option>
            {(crops ?? []).map((c) => (
              <option key={c.crop_code} value={c.crop_name}>
                {c.crop_name}
              </option>
            ))}
          </select>

          {/* District */}
          <select
            aria-label={t("header.district")}
            className="input hidden lg:block max-w-[9rem]"
            value={filters.district ?? ""}
            onChange={(e) => setFilters({ district: e.target.value || undefined })}
          >
            <option value="">{t("header.district")}</option>
            {(districts ?? []).map((d) => (
              <option key={d.district_code} value={d.district}>
                {d.district}
              </option>
            ))}
          </select>

          {hasFilters ? (
            <button
              type="button"
              className="btn hidden sm:inline-flex"
              onClick={() =>
                setFilters({
                  year: undefined,
                  season: undefined,
                  crop: undefined,
                  province: undefined,
                  district: undefined,
                })
              }
            >
              Clear
            </button>
          ) : null}

          {/* Language */}
          <div
            role="group"
            aria-label="Language"
            className="flex overflow-hidden rounded-lg border border-forest/15 bg-white text-xs"
          >
            {(["en", "rw"] as const).map((code) => (
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

          <button type="button" className="btn" aria-label={t("header.notifications")}>
            <Bell className="h-4 w-4" />
          </button>
          <button type="button" className="btn" aria-label={t("header.profile")}>
            <UserRound className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
