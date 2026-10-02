/**
 * Local crop watchlist.
 *
 * Saved crops live in the on-device SQLite store (`saved_item`), so the
 * watchlist works fully offline and needs no account. The hook re-reads on
 * focus so a crop saved from Crop Detail appears here immediately.
 */

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { listSaved, removeSavedItem, saveItem } from "../database";

export function useSavedCrops() {
  const [savedCodes, setSavedCodes] = useState<Record<string, true>>({});

  const reload = useCallback(() => {
    try {
      const rows = listSaved("crop");
      const next: Record<string, true> = {};
      for (const row of rows) next[row.entity_key] = true;
      setSavedCodes(next);
    } catch {
      setSavedCodes({});
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const toggle = useCallback(
    (crop: { crop_code: string; crop_name: string; category?: string | null }) => {
      try {
        if (savedCodes[crop.crop_code]) {
          removeSavedItem("crop", crop.crop_code);
        } else {
          saveItem({
            type: "crop",
            entityKey: crop.crop_code,
            title: crop.crop_name,
            subtitle: crop.category ?? null,
          });
        }
      } catch {
        // Storage unavailable: keep the previous state rather than a false one.
      }
      reload();
    },
    [reload, savedCodes],
  );

  return { savedCodes, toggle };
}
