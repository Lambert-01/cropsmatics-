"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Source and methodology disclosure.
 *
 * Provenance is always available, but starts collapsed so analytical pages stay
 * readable. It deliberately does not follow a saved preference: an old
 * `showSources: true` value must not reopen every footer for returning users.
 *
 * When collapsed it degrades to a single labelled control rather than
 * disappearing, so the reader still knows there is something behind it.
 */
export function SourceDisclosure({
  children,
  summary = "Source and methodology",
  className,
}: {
  children: ReactNode;
  summary?: string;
  className?: string;
}) {
  // `null` means "collapsed". The local override is intentionally per-panel so
  // opening one disclosure does not turn every chart into a wall of metadata.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override === true;

  if (!open) {
    return (
      <div className={cn("mt-3 border-t border-forest/5 pt-2", className)}>
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOverride(true)}
          className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-slate-500 outline-none hover:text-forest focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          {summary}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        // Source ids are long, comma-joined and unbreakable ("NISR_SAS_2025B_…"
        // repeated six times). `break-words` lets each token wrap inside its
        // own track instead of widening the document, and `min-w-0` lets the
        // block shrink inside flex/grid parents that would otherwise size to
        // their content. The full identifier stays readable; nothing is
        // clipped away by a global `overflow-x-hidden`.
        "mt-3 min-w-0 border-t border-forest/5 pt-2 text-[11px] leading-relaxed text-slate-500 break-words",
        className,
      )}
    >
      {children}
      <button
        type="button"
        aria-expanded
        onClick={() => setOverride(false)}
        className="ml-1 rounded font-medium text-slate-400 underline decoration-dotted outline-none hover:text-forest focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Hide
      </button>
    </div>
  );
}
