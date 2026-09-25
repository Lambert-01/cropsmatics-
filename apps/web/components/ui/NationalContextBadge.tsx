import { Globe2 } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Explicit marker for datasets whose level of analysis is national.
 *
 * Section E of the UX pass: national modules must stay honest. Rather than
 * letting district/crop filters appear to do something, this badge names the
 * scope (NATIONAL CONTEXT) and lists which active filters do not apply.
 */
export function NationalContextBadge({
  note,
  className,
}: {
  /** Which filters do not apply, e.g. "Crop filter not applicable · District filter not applicable". */
  note?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1.5 rounded-full border border-info/25 bg-info/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-info",
        className,
      )}
      title="This dataset is published at national level only. Values are never broken down by district."
    >
      <Globe2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      NATIONAL CONTEXT
      {note ? (
        <span className="font-medium normal-case tracking-normal text-slate-600">· {note}</span>
      ) : null}
    </span>
  );
}
