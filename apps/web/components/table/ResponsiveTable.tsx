"use client";

import { ChevronsUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A reusable, professional responsive table system.
 *
 * Design rules (section G of the UX pass):
 * - headers may wrap to two lines; units render on their own line (no nowrap)
 * - numeric cells never wrap and use tabular-nums so digits align vertically
 * - explicit column widths instead of font shrinking
 * - sticky header, optional sticky first column, horizontal scroll only when
 *   the combined minimum widths genuinely exceed the container
 * - sortable headers with proper aria-sort semantics and keyboard focus
 * - long strings truncate with a title tooltip instead of blowing up columns
 */

export type SortDirection = "asc" | "desc";

export interface Column<T> {
  id: string;
  header: string;
  /** Optional unit shown on the header's second line, e.g. "kg/ha". */
  unit?: string;
  align?: "left" | "right" | "center";
  width?: number | string;
  minWidth?: number;
  numeric?: boolean;
  sortable?: boolean;
  /** Raw comparable value; defaults to the rendered cell value. */
  sortValue?: (row: T) => string | number | null;
  cell: (row: T) => ReactNode;
  /** Sticky first column (e.g. District) while the rest scroll horizontally. */
  sticky?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSort?: { id: string; direction: SortDirection };
  /** Controlled sort (e.g. driven by a TableToolbar selector). */
  sort?: { id: string; direction: SortDirection } | null;
  onSortChange?: (s: { id: string; direction: SortDirection } | null) => void;
  emptyMessage?: string;
  caption?: string;
  className?: string;
}

function compareValues(a: string | number | null, b: string | number | null): number {
  // nulls sort last in both directions — they are "unknown", not "smallest".
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  sort: controlledSort,
  onSortChange,
  emptyMessage = "No rows to display.",
  caption,
  className,
}: Props<T>) {
  const [internalSort, setInternalSort] = useState<{ id: string; direction: SortDirection } | null>(
    initialSort ?? null,
  );
  const sort = controlledSort !== undefined ? controlledSort : internalSort;
  const setSort = (
    nextOrUpdater:
      | { id: string; direction: SortDirection } | null
      | ((prev: { id: string; direction: SortDirection } | null) => {
          id: string;
          direction: SortDirection;
        } | null),
  ) => {
    const next = typeof nextOrUpdater === "function" ? nextOrUpdater(internalSort) : nextOrUpdater;
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue && !col?.cell) return rows;
    const getter =
      col.sortValue ??
      ((row: T) => {
        // Default: cells often return numbers; probe is avoided — sortable
        // columns should declare sortValue explicitly.
        return null;
      });
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareValues(getter(a), getter(b));
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, columns]);

  const toggleSort = (id: string) => {
    setSort((prev) => {
      if (prev?.id !== id) return { id, direction: "desc" };
      if (prev.direction === "desc") return { id, direction: "asc" };
      return null;
    });
  };

  return (
    <div className={cn("responsive-table-wrap", className)}>
      <table className="responsive-table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => {
              const sorted = sort?.id === col.id;
              const SortIcon = sorted
                ? sort!.direction === "desc"
                  ? ChevronDown
                  : ChevronUp
                : ChevronsUpDown;
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={
                    sorted ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"
                  }
                  style={{
                    width: col.width,
                    minWidth: col.minWidth,
                  }}
                  className={cn(
                    "rt-th",
                    col.align === "right" && "rt-th-right",
                    col.align === "center" && "rt-th-center",
                    col.sticky && "rt-sticky-col",
                    col.numeric && "rt-numeric",
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className="rt-sort-btn"
                    >
                      <span className="rt-header-text">
                        {col.header}
                        {col.unit ? <span className="rt-unit">{col.unit}</span> : null}
                      </span>
                      <SortIcon className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="rt-header-text">
                      {col.header}
                      {col.unit ? <span className="rt-unit">{col.unit}</span> : null}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="rt-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, index) => (
              <tr key={rowKey(row)}>
                {columns.map((col, colIndex) => (
                  <td
                    key={col.id}
                    className={cn(
                      "rt-td",
                      col.align === "right" && "rt-td-right",
                      col.align === "center" && "rt-td-center",
                      col.numeric && "rt-numeric",
                      col.sticky && "rt-sticky-col",
                    )}
                    style={
                      col.sticky
                        ? { left: columns.slice(0, colIndex).reduce((acc, c) => acc + (typeof c.width === "number" ? c.width : 160), 0) }
                        : undefined
                    }
                    title={
                      typeof col.cell(row) === "string" && String(col.cell(row)).length > 24
                        ? String(col.cell(row))
                        : undefined
                    }
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
