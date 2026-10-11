"use client";

import { cn } from "@/lib/cn";
import { useDistricts } from "@/services/hooks/useReference";

/**
 * "Compare with" control for a crop trend chart.
 *
 * Offers the national series (only when the primary series is a district, so the
 * two lines can never be identical) and every district except the primary one.
 * The value is `""`, `"national"`, or a district name — the same vocabulary the
 * Crop Intelligence and Yield Intelligence pages both resolve against the same
 * `productivity/trend` panel, so the two overlays are directly comparable.
 */
export function TrendCompareControl({
  value,
  onChange,
  primaryDistrict,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  primaryDistrict?: string | null;
  className?: string;
}) {
  const { data: districts } = useDistricts();

  return (
    <label className={cn("flex flex-wrap items-center gap-2 text-xs", className)}>
      <span className="font-semibold uppercase tracking-wide text-slate-500">Compare with</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Compare the trend with another series"
      >
        <option value="">No comparison</option>
        {primaryDistrict ? <option value="national">National</option> : null}
        {(districts ?? [])
          .filter((d) => d.district !== primaryDistrict)
          .map((d) => (
            <option key={d.district_code} value={d.district}>
              {d.district}
            </option>
          ))}
      </select>
    </label>
  );
}
