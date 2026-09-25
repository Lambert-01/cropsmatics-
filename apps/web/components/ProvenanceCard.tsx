import { Database, FileWarning } from "lucide-react";

import { benchmarkLabel, periodLabel } from "@/lib/format";
import type { Provenance } from "@/types";

export function ProvenanceCard({
  provenance,
  lastProcessed,
}: {
  provenance: Provenance;
  lastProcessed?: string | null;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="card-title">Data provenance</h2>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <Field label="Source" value={provenance.source_id} />
        <Field label="Period" value={periodLabel(provenance.source_period) || "—"} />
        <Field label="Method" value={provenance.method} />
        <Field
          label="Benchmark"
          value={provenance.benchmark_strategy ? benchmarkLabel(provenance.benchmark_strategy) : undefined}
        />
        {lastProcessed ? <Field label="Last processed" value={lastProcessed} /> : null}
      </dl>
      {provenance.limitations?.length ? (
        <div className="mt-3 rounded-lg border border-amber/20 bg-amber/[0.05] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber">
            <FileWarning className="h-3.5 w-3.5" aria-hidden="true" /> Limitations
          </p>
          <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs text-slate-600">
            {provenance.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}
