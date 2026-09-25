"use client";

import { useState } from "react";

import { GapTable } from "@/features/productivity/GapTable";
import { useProductivityGap } from "@/services/hooks/useProductivity";

const STRATEGIES = [
  "national_crop_median",
  "national_crop_season_median",
  "top_quartile_comparable_districts",
];

export default function ProductivityPage() {
  const [strategy, setStrategy] = useState(STRATEGIES[0]);
  const { data, isLoading } = useProductivityGap(strategy);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-forest">Productivity Intelligence</h1>
      <label className="block text-sm">
        <span className="mr-2 text-slate-600">Benchmark strategy</span>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1"
        >
          {STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>

      {isLoading ? <p className="text-slate-500">Loading…</p> : <GapTable rows={data?.rows ?? []} />}

      <p className="text-xs text-slate-500">
        Changing the benchmark changes the ranking. The chosen strategy is always shown with the
        results so comparisons stay honest.
      </p>
    </div>
  );
}
