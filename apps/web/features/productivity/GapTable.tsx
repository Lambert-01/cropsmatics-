import type { ProductivityRow } from "@/types";

/** Presentational table. Fetching lives in services/hooks, not here. */
export function GapTable({ rows }: { rows: ProductivityRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">No rows. Build data with `make data` and start the API.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-3 py-2">District</th>
            <th className="px-3 py-2">Crop</th>
            <th className="px-3 py-2 text-right">Yield (kg/ha)</th>
            <th className="px-3 py-2 text-right">Benchmark</th>
            <th className="px-3 py-2 text-right">Gap index</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.district}-${r.crop}-${i}`} className="border-t border-slate-100">
              <td className="px-3 py-2">{r.district}</td>
              <td className="px-3 py-2">{r.crop}</td>
              <td className="px-3 py-2 text-right">{fmt(r.yield_kg_ha)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.benchmark_yield_kg_ha)}</td>
              <td className="px-3 py-2 text-right font-medium">{fmt(r.gap_index, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmt(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
