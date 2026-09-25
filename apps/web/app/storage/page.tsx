"use client";

import { useQuery } from "@tanstack/react-query";

import { api, BASE_URL } from "@/lib/api";

interface FacilityContext {
  district: string;
  initiative?: string;
  context?: string;
  capacity_kg: number | null;
  capacity_status: string;
}

export default function StoragePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["facilities"],
    queryFn: async (): Promise<{ facilities: FacilityContext[]; note: string }> => {
      const res = await fetch(`${BASE_URL}/facilities/nearby`);
      if (!res.ok) throw new Error(`failed: ${res.status}`);
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-forest">Storage &amp; Aggregation</h1>
      <p className="text-sm text-slate-600">
        Facility context from public sources. Where capacity is not published, it is shown as
        <strong> not verified</strong> rather than estimated.
      </p>

      {isLoading ? (
        <p className="text-slate-500">Loading facilities…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">District</th>
                <th className="px-3 py-2">Initiative</th>
                <th className="px-3 py-2">Capacity</th>
              </tr>
            </thead>
            <tbody>
              {(data?.facilities ?? []).map((f) => (
                <tr key={f.district} className="border-t border-slate-100">
                  <td className="px-3 py-2">{f.district}</td>
                  <td className="px-3 py-2">{f.initiative ?? "—"}</td>
                  <td className="px-3 py-2">
                    {f.capacity_kg === null ? (
                      <span className="text-slate-500">Capacity not verified</span>
                    ) : (
                      f.capacity_kg
                    )}
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
