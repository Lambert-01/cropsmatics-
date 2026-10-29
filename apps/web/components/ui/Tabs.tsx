"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  /** Optional short marker, e.g. a count or a status word. */
  badge?: string;
}

/**
 * Workspace tab strip.
 *
 * The same markup the Data Explorer already used, extracted so the analytical
 * workspaces (Yield, Interventions) share one tab grammar instead of each
 * growing its own. Selection is exposed through ARIA so the active workspace is
 * announced rather than only coloured.
 */
export function Tabs({
  items,
  active,
  onChange,
  ariaLabel,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              selected
                ? "bg-primary text-white"
                : "border border-forest/15 bg-white text-slate-600 hover:bg-forest/5 dark:border-white/15 dark:bg-surface dark:text-slate-200 dark:hover:bg-white/5",
            )}
          >
            {item.label}
            {item.badge ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  selected ? "bg-white/20 text-white" : "bg-forest/[0.06] text-slate-500",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
