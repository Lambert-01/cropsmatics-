"use client";

import { FlaskConical, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { api } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import type { AllocationResponse } from "@/types";

interface SourceRow {
  id: string;
  crop: string;
  quantity_kg: number;
}
interface FacilityRow {
  id: string;
  capacity_kg: number | null;
  storage_cost_per_kg: number;
}

const DEFAULT_SOURCES: SourceRow[] = [
  { id: "Ngoma co-op", crop: "Maize", quantity_kg: 12000 },
  { id: "Gatsibo farm", crop: "Maize", quantity_kg: 8000 },
];
const DEFAULT_FACILITIES: FacilityRow[] = [
  { id: "Rwamagana packhouse", capacity_kg: 15000, storage_cost_per_kg: 12 },
  { id: "Unverified store", capacity_kg: null, storage_cost_per_kg: 5 },
];

export function OptimizationDemo() {
  const [sources, setSources] = useState<SourceRow[]>(DEFAULT_SOURCES);
  const [facilities, setFacilities] = useState<FacilityRow[]>(DEFAULT_FACILITIES);
  const [distances, setDistances] = useState<Record<string, number>>({});
  const [result, setResult] = useState<AllocationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const distanceKey = (s: string, f: string) => `${s}|${f}`;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await api.storageAllocation({
        sources,
        facilities,
        distances,
      });
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Storage allocation (OR-Tools)
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber">
              Scenario / demonstration mode
            </span>
          </span>
        }
        subtitle="Feed hypothetical or verified inputs and see the optimization result. Nothing here is official statistics."
      />

      <div className="flex items-start gap-2 border-t border-forest/10 bg-amber/[0.05] px-4 py-2 text-[11px] text-slate-600">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden="true" />
        <span>
          Values you type are user inputs. They are never merged into official data or presented as
          verified. Facilities with blank capacity are excluded from allocation by design.
        </span>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        {/* Sources */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Harvest sources
          </h3>
          <div className="mt-2 space-y-2">
            {sources.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className="input"
                  aria-label={`Source ${i + 1} name`}
                  value={s.id}
                  onChange={(e) => {
                    const next = [...sources];
                    next[i] = { ...s, id: e.target.value };
                    setSources(next);
                  }}
                />
                <input
                  className="input"
                  aria-label={`Source ${i + 1} crop`}
                  value={s.crop}
                  onChange={(e) => {
                    const next = [...sources];
                    next[i] = { ...s, crop: e.target.value };
                    setSources(next);
                  }}
                />
                <input
                  className="input w-28"
                  type="number"
                  aria-label={`Source ${i + 1} quantity kg`}
                  value={s.quantity_kg}
                  onChange={(e) => {
                    const next = [...sources];
                    next[i] = { ...s, quantity_kg: Number(e.target.value) };
                    setSources(next);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() => setSources([...sources, { id: "New source", crop: "Maize", quantity_kg: 5000 }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add source
            </button>
          </div>
        </section>

        {/* Facilities */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Facilities (blank capacity = not verified)
          </h3>
          <div className="mt-2 space-y-2">
            {facilities.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_6rem_auto] gap-2">
                <input
                  className="input"
                  aria-label={`Facility ${i + 1} name`}
                  value={f.id}
                  onChange={(e) => {
                    const next = [...facilities];
                    next[i] = { ...f, id: e.target.value };
                    setFacilities(next);
                  }}
                />
                <input
                  className="input"
                  type="number"
                  placeholder="capacity kg"
                  aria-label={`Facility ${i + 1} capacity kg`}
                  value={f.capacity_kg ?? ""}
                  onChange={(e) => {
                    const next = [...facilities];
                    next[i] = {
                      ...f,
                      capacity_kg: e.target.value === "" ? null : Number(e.target.value),
                    };
                    setFacilities(next);
                  }}
                />
                <input
                  className="input"
                  type="number"
                  aria-label={`Facility ${i + 1} storage cost`}
                  value={f.storage_cost_per_kg}
                  onChange={(e) => {
                    const next = [...facilities];
                    next[i] = { ...f, storage_cost_per_kg: Number(e.target.value) };
                    setFacilities(next);
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove facility ${i + 1}`}
                  onClick={() => setFacilities(facilities.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                setFacilities([...facilities, { id: "New facility", capacity_kg: null, storage_cost_per_kg: 0 }])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add facility
            </button>
          </div>
        </section>
      </div>

      {/* Distances */}
      <div className="border-t border-forest/10 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Distances (km, source → facility)
        </h3>
        <div className="thin-scroll mt-2 overflow-auto">
          <table className="table-base min-w-max">
            <thead>
              <tr>
                <th>Source \\ Facility</th>
                {facilities.map((f) => (
                  <th key={f.id}>{f.id}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium text-slate-600">{s.id}</td>
                  {facilities.map((f) => (
                    <td key={f.id}>
                      <input
                        className="input w-20"
                        type="number"
                        aria-label={`Distance ${s.id} to ${f.id} km`}
                        value={distances[distanceKey(s.id, f.id)] ?? 0}
                        onChange={(e) =>
                          setDistances({
                            ...distances,
                            [distanceKey(s.id, f.id)]: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-4 pb-3">
        <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
          <Play className="h-3.5 w-3.5" />
          {running ? "Solving…" : "Run optimization"}
        </button>
      </div>

      {error ? (
        <div className="px-4 pb-4">
          <ErrorState message={`${error}. The OR-Tools solver may not be installed in this environment.`} />
        </div>
      ) : null}

      {result ? (
        <div className="border-t border-forest/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="chip">
              Status: <strong className="text-forest">{result.status}</strong>
            </span>
            <span className="chip">
              Objective (transport + storage cost): <strong>{fmtNumber(result.total_cost, 0)}</strong>
            </span>
            <span className="chip">
              Unassigned: <strong>{result.unassigned.length}</strong> source(s)
            </span>
          </div>

          {result.assignments.length > 0 ? (
            <div className="thin-scroll mt-3 overflow-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Facility</th>
                    <th className="text-right">Quantity (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.assignments.map((a, i) => (
                    <tr key={i}>
                      <td>{a.source}</td>
                      <td>{a.facility}</td>
                      <td className="text-right">{fmtNumber(a.quantity_kg, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              No assignment was possible — usually because capacity is unverified or zero.
            </p>
          )}

          <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
            {result.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
            {result.capacity_not_verified.length ? (
              <li>• Capacity not verified (excluded): {result.capacity_not_verified.join(", ")}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
