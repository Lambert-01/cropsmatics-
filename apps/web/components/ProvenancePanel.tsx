import type { Provenance } from "@/types";

export function ProvenancePanel({ provenance }: { provenance: Provenance }) {
  return (
    <details className="mt-4 rounded border border-slate-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">
        Source, method &amp; limitations
      </summary>
      <dl className="mt-2 grid gap-1 text-slate-600">
        {provenance.source_id && (
          <div>
            <dt className="inline font-medium">Source: </dt>
            <dd className="inline">{provenance.source_id}</dd>
          </div>
        )}
        {provenance.source_period && (
          <div>
            <dt className="inline font-medium">Period: </dt>
            <dd className="inline">{provenance.source_period}</dd>
          </div>
        )}
        {provenance.method && (
          <div>
            <dt className="inline font-medium">Method: </dt>
            <dd className="inline">{provenance.method}</dd>
          </div>
        )}
        {provenance.benchmark_strategy && (
          <div>
            <dt className="inline font-medium">Benchmark: </dt>
            <dd className="inline">{provenance.benchmark_strategy}</dd>
          </div>
        )}
        {provenance.limitations?.length ? (
          <div>
            <dt className="font-medium">Limitations:</dt>
            <dd>
              <ul className="ml-5 list-disc">
                {provenance.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
