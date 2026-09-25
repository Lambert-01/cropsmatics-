import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { coverageMode, coverageNotice } from "@/lib/coverage";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-lg bg-forest/[0.06]", className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-20" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

export function KpiRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <KpiSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 w-full" />
      <div style={{ height }} className="mt-3">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}

export function MapSkeleton({ height = 460 }: { height?: number }) {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-52" />
      <div style={{ height }} className="mt-3">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-40" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title = "No verified data are available for this selection.",
  hint = "Try another period, crop, or geography.",
  icon,
}: {
  title?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-forest/15 bg-white/60 px-6 py-10 text-center"
    >
      <span className="rounded-full bg-forest/[0.06] p-2 text-forest/60" aria-hidden="true">
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <p className="text-sm font-medium text-forest">{title}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-danger/25 bg-danger/[0.04] p-4 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <p className="font-medium text-danger">Could not load data</p>
          <p className="mt-0.5 text-slate-600">
            {message ?? "The analytics API did not respond. Check that the API is running."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Developer hint: start the API with <code>make api</code> and build tables with{" "}
            <code>make data</code>.
          </p>
        </div>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-primary w-fit" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      ) : null}
    </div>
  );
}

export function CoverageNotice({ level, period }: { level?: string | null; period?: string | null }) {
  const message = level ? coverageNotice(coverageMode(level), period) : null;
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber/25 bg-amber/[0.06] px-3 py-2 text-xs text-slate-700">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
