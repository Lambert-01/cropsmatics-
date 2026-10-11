"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import { useProductivityAtPeriod } from "@/services/hooks/useAnalytics";
import { usePeriods } from "@/services/hooks/useReference";
import type { DashboardFilters } from "@/lib/filters";

import { DistrictChangeSlope } from "./DistrictChangeSlope";

/**
 * Container for the two-period district change view.
 *
 * Owns the period pair (defaulting to the two most recent releases) and the two
 * pinned productivity reads. Only period codes from the catalogue can be chosen,
 * so an unpublished season can never be requested.
 */
export function DistrictChangePanel({ filters }: { filters: DashboardFilters }) {
  const periods = usePeriods();
  const catalogue = useMemo(() => periods.data?.periods ?? [], [periods.data]);
  const codes = useMemo(() => catalogue.map((p) => p.period_code), [catalogue]);
  const labelFor = (code: string) =>
    catalogue.find((p) => p.period_code === code)?.label ?? code;

  const [fromCode, setFromCode] = useState<string>("");
  const [toCode, setToCode] = useState<string>("");

  // Default to the two latest published periods once the catalogue resolves,
  // and repair a selection if the catalogue changes underneath it.
  useEffect(() => {
    if (codes.length === 0) return;
    setFromCode((current) => (current && codes.includes(current) ? current : codes[0] ?? ""));
    setToCode((current) =>
      current && codes.includes(current) ? current : codes[1] ?? codes[0] ?? "",
    );
  }, [codes]);

  const enabled = codes.length >= 2;
  const from = useProductivityAtPeriod(filters, fromCode || undefined, enabled);
  const to = useProductivityAtPeriod(filters, toCode || undefined, enabled);

  if (!enabled) {
    return (
      <Card className="p-4 text-sm text-slate-500">
        Two-period change needs at least two published periods for the current dataset. Only one is
        available, so no comparison is shown — nothing is inferred across an unavailable release.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-4 p-3">
        <PeriodSelect
          label="Earlier period"
          value={fromCode}
          onChange={setFromCode}
          options={catalogue.map((p) => ({ value: p.period_code, label: p.label }))}
        />
        <PeriodSelect
          label="Later period"
          value={toCode}
          onChange={setToCode}
          options={catalogue.map((p) => ({ value: p.period_code, label: p.label }))}
        />
        <span className="text-[11px] text-slate-500">
          Compared crop: {filters.crop ?? "all crops"} · district resolution
        </span>
      </div>

      <DistrictChangeSlope
        fromData={from.data}
        toData={to.data}
        fromLabel={labelFor(fromCode)}
        toLabel={labelFor(toCode)}
        crop={filters.crop}
        isLoading={from.isLoading || to.isLoading}
      />
    </div>
  );
}

function PeriodSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
