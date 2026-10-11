import { Snowflake } from "lucide-react";

import { featureToPath, type GeoFeature, type Project } from "@/features/maps/geo";
import type { FacilityItem } from "@/types";

/**
 * Program-district overlay.
 *
 * Hatches and outlines each *district* that is in the cold-chain programme. It
 * deliberately draws no point: the source publishes no facility coordinates, and
 * a marker at a district's centre reads as "there is a facility here" even when
 * the caption says otherwise. A whole-district hatch says the only thing that is
 * actually known — this district is in the programme — and says it in the same
 * shape as the boundary the reader can check.
 *
 * `pointer-events-none` keeps the districts clickable underneath.
 */
export function FacilityDistrictMarkers({
  features, project, facilities,
}: {
  features: GeoFeature[];
  project: Project;
  facilities: FacilityItem[];
}) {
  const codes = new Set(facilities.map((f) => f.district_code).filter(Boolean));
  const program = features.filter((f) => codes.has(f.properties.district_code));
  if (program.length === 0) return null;

  return (
    <g aria-label="Cold-chain program districts" className="pointer-events-none">
      <defs>
        <pattern
          id="program-district-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#073D2D" fillOpacity="0.14" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#073D2D" strokeWidth="2.5" strokeOpacity="0.5" />
        </pattern>
      </defs>
      {program.map((feature) => (
        <path
          key={feature.properties.district_code}
          d={featureToPath(feature, project)}
          fill="url(#program-district-hatch)"
          stroke="#073D2D"
          strokeWidth={1.6}
        />
      ))}
    </g>
  );
}

/**
 * Cold-chain program context layer.
 *
 * The public source lists program districts but publishes neither facility
 * coordinates nor capacities, so this layer is presented as an honest list with
 * "Capacity not verified" rather than invented map points.
 */
export function FacilityLayer({ facilities }: { facilities: FacilityItem[] }) {
  if (!facilities.length) {
    return (
      <p className="text-xs text-slate-500">No verified cold-chain context for this selection.</p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-info">
        <Snowflake className="h-3.5 w-3.5" aria-hidden="true" /> MINAGRI–ACES cold-chain program districts
      </p>
      <p className="text-[11px] text-slate-500">
        On the map, a hatched district is <strong>a program district</strong> — not a facility location.
      </p>
      <ul className="space-y-1.5">
        {facilities.map((f) => (
          <li
            key={`${f.district}-${f.initiative}`}
            className="rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-forest">{f.district}</span>
              <span className="rounded-full bg-amber/10 px-1.5 py-0.5 text-[10px] font-medium text-amber">
                Capacity not verified
              </span>
            </div>
            <p className="mt-0.5 text-slate-500">{f.initiative}</p>
            <p className="text-[11px] text-slate-400">District context only; exact facility location not published. Source: {f.source_id ?? "MINAGRI"}.</p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-400">
        Facility coordinates and capacities are not published in the source, so no map points are
        fabricated.
      </p>
    </div>
  );
}
