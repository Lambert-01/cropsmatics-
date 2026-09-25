import { cn } from "@/lib/cn";
import { priorityBand } from "@/lib/constants";

/** Priority/risk badge: always colour + icon + text (never colour alone). */
export function PriorityBadge({ band, className }: { band?: string | null; className?: string }) {
  const b = priorityBand(band);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        b.className,
        className,
      )}
    >
      <span aria-hidden="true">{b.icon}</span>
      <span>{b.label}</span>
    </span>
  );
}
