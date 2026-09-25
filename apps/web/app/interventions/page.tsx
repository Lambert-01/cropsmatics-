"use client";

import { useQuery } from "@tanstack/react-query";

import { RiskBadge } from "@/components/RiskBadge";
import { api } from "@/lib/api";

export default function InterventionsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["priorities"], queryFn: () => api.priorities(30) });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-forest">Intervention Planner</h1>
      <p className="text-sm text-slate-600">
        Priority = weighted gap, vulnerability, affected scale and readiness minus cost constraint.
        Weights are visible and adjustable in a later iteration.
      </p>

      {data && (
        <p className="rounded bg-slate-100 p-3 text-xs text-slate-600">
          Weights: {Object.entries(data.weights).map(([k, v]) => `${k}=${v}`).join(", ")}
        </p>
      )}

      {isLoading ? (
        <p className="text-slate-500">Loading priorities…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">District</th>
                <th className="px-3 py-2">Crop</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">Band</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.district}</td>
                  <td className="px-3 py-2">{r.crop}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.score.toFixed(3)}</td>
                  <td className="px-3 py-2">
                    <RiskBadge band={r.band} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
