import { cn } from "@/lib/cn";

/**
 * Provenance badge for a data block.
 *
 * The distinction between official national statistics, verified program
 * context, user scenario input and unverified data is a product requirement, so
 * it is a first-class component rather than ad-hoc markup.
 */
export type DataBadgeKind =
  | "official_national"
  | "verified_program"
  | "scenario_input"
  | "not_verified"
  | "facility_unavailable";

export const BADGE_KINDS: Record<DataBadgeKind, { label: string; className: string; title: string }> = {
  official_national: {
    label: "OFFICIAL NATIONAL DATA",
    className: "border-primary/25 bg-primary/10 text-primary",
    title:
      "Published MINAGRI national totals. Not district values and not facility-level capacity.",
  },
  verified_program: {
    label: "VERIFIED PROGRAM CONTEXT",
    className: "border-info/25 bg-info/10 text-info",
    title:
      "Region/program membership confirmed by an official source. No facility capacity is published.",
  },
  scenario_input: {
    label: "SCENARIO INPUT",
    className: "border-amber/30 bg-amber/10 text-amber",
    title: "Values supplied by the user for a what-if optimization run. Not official data.",
  },
  not_verified: {
    label: "NOT VERIFIED",
    className: "border-amber/30 bg-amber/10 text-amber",
    title: "The official source does not publish this value, so it is shown as not verified.",
  },
  facility_unavailable: {
    label: "FACILITY-LEVEL DATA: NOT AVAILABLE",
    className: "border-slate-400/30 bg-slate-500/10 text-slate-600",
    title: "No facility-level capacity or location is published in any source used here.",
  },
};

export function DataBadge({ kind, className }: { kind: DataBadgeKind; className?: string }) {
  const spec = BADGE_KINDS[kind];
  return (
    <span
      title={spec.title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        spec.className,
        className,
      )}
    >
      {spec.label}
    </span>
  );
}
