import { Snowflake } from "lucide-react";

import type { FacilityItem } from "@/types";

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
