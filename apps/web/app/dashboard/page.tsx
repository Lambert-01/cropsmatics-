"use client";

import { ProvenancePanel } from "@/components/ProvenancePanel";
import { StatCard } from "@/components/StatCard";
import { GapTable } from "@/features/productivity/GapTable";
import { useProductivityGap } from "@/services/hooks/useProductivity";

export default function DashboardPage() {
  const { data, isLoading, error } = useProductivityGap();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-forest">National Overview</h1>

      {isLoading && <p className="text-slate-500">Loading productivity gaps…</p>}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not load data. Ensure the API is running (`make api`) and the data pipeline has run
          (`make data`).
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Rows returned" value={data.count} />
            <StatCard label="Benchmark strategy" value={data.strategy} />
            <StatCard label="Season" value={data.provenance.source_period ?? "—"} />
          </div>
          <GapTable rows={data.rows} />
          <ProvenancePanel provenance={data.provenance} />
        </>
      )}
    </div>
  );
}
