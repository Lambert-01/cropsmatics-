/**
 * Count of actionable local signals, for the header notification badge.
 *
 * The badge is the same real set the Alerts screen lists: sync failures,
 * conflicts needing review, and harvests whose date is approaching. It is never
 * a decorative number — when nothing is actionable it is zero and the badge is
 * hidden. Recomputes on focus so a sync or a new harvest updates it.
 */

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { listHarvests, listPendingOutbox } from "../database";
import { isValidIsoDate, todayIso } from "../utils/dates";

/** A harvest within this many days is flagged as approaching. */
const APPROACHING_DAYS = 7;

export function useAlertsCount(): number {
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let total = 0;
      try {
        const pending = listPendingOutbox();
        total += pending.filter(
          (item) => item.status === "FAILED" || item.status === "CONFLICT",
        ).length;

        const today = todayIso();
        for (const harvest of listHarvests()) {
          const date = harvest.harvestStartDate ?? harvest.expectedHarvestDate ?? null;
          if (!isValidIsoDate(date)) continue;
          const days = Math.round(
            (new Date(date as string).getTime() - new Date(today).getTime()) / 86_400_000,
          );
          if (days >= 0 && days <= APPROACHING_DAYS) total += 1;
        }
      } catch {
        // Storage unavailable: no badge rather than an invented one.
        total = 0;
      }
      setCount(total);
    }, []),
  );

  return count;
}
