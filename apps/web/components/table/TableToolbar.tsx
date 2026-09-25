"use client";

import { Search, RotateCcw } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Toolbar that pairs with ResponsiveTable: free-text search, a sort selector
 * for small screens (where sticky sort buttons are awkward), an optional
 * actions slot and an always-visible filtered row count.
 */
export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  sort,
  onSortChange,
  sortOptions,
  resultCount,
  totalCount,
  onReset,
  actions,
  className,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  sort?: { id: string; direction: "asc" | "desc" };
  onSortChange?: (s: { id: string; direction: "asc" | "desc" }) => void;
  sortOptions?: { id: string; label: string }[];
  resultCount?: number;
  totalCount?: number;
  onReset?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const showReset = onReset && (search || (sort && (sort.id || sort.direction)));
  return (
    <div className={cn("flex flex-wrap items-center gap-2 px-4 pb-3 pt-3", className)}>
      {onSearchChange ? (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="input h-8 w-full pl-8 text-sm"
          />
        </div>
      ) : null}

      {sortOptions && onSortChange ? (
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="hidden sm:inline">Sort</span>
          <select
            aria-label="Sort table"
            className="input h-8 w-fit py-1 text-sm"
            value={sort ? `${sort.id}:${sort.direction}` : ""}
            onChange={(e) => {
              const [id, direction] = e.target.value.split(":");
              if (id && direction) onSortChange({ id, direction: direction as "asc" | "desc" });
            }}
          >
            <option value="">—</option>
            {sortOptions.map((o) => (
              <Fragment key={o.id}>
                <option value={`${o.id}:desc`}>{o.label} ↓</option>
                <option value={`${o.id}:asc`}>{o.label} ↑</option>
              </Fragment>
            ))}
          </select>
        </label>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {typeof resultCount === "number" ? (
          <span className="text-[11px] font-medium text-slate-500" aria-live="polite">
            {resultCount}
            {typeof totalCount === "number" && totalCount !== resultCount
              ? ` of ${totalCount}`
              : ""}{" "}
            rows
          </span>
        ) : null}
        {showReset ? (
          <button type="button" onClick={onReset} className="btn px-2 py-1 text-xs">
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset
          </button>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
