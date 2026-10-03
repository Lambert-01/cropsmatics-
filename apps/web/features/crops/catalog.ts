/**
 * Crop catalogue helpers.
 *
 * Pure and synchronous so the two presentation rules the crop pages depend on are
 * testable without a renderer: which catalogue entry a URL slug names, and how the
 * catalogue is grouped. Neither invents a crop — an unknown slug resolves to
 * `undefined`, which the page renders as "not found" rather than as an empty
 * page that looks like a data outage.
 */

import type { Crop } from "@/types";

/** Category used for catalogue entries with no published category. */
export const UNCATEGORISED = "Other crops";

/**
 * Resolve a route slug to a catalogue crop.
 *
 * Matches either the code or the display name, case-insensitively, so
 * `/crops/maize` and `/crops/Maize` both open the same crop. A blank slug never
 * matches.
 */
export function resolveCrop(crops: readonly Crop[] | undefined, code: string): Crop | undefined {
  const needle = code.trim().toLowerCase();
  if (!needle) return undefined;
  return (crops ?? []).find(
    (crop) =>
      crop.crop_code?.toLowerCase() === needle || crop.crop_name.toLowerCase() === needle,
  );
}

export interface CropGroup {
  category: string;
  items: Crop[];
}

/** Group the catalogue by category, each group sorted by crop name. */
export function groupCropsByCategory(crops: readonly Crop[] | undefined): CropGroup[] {
  const byCategory = new Map<string, Crop[]>();
  for (const crop of crops ?? []) {
    const key = crop.category?.trim() || UNCATEGORISED;
    const bucket = byCategory.get(key) ?? [];
    bucket.push(crop);
    byCategory.set(key, bucket);
  }
  return Array.from(byCategory.entries())
    .map(([category, items]) => ({
      category,
      items: [...items].sort((a, b) => a.crop_name.localeCompare(b.crop_name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
