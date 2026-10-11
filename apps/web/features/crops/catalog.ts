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

/** Category shown for a crop when the catalogue carries none. */
export function categoryOf(crop: Crop): string {
  return crop.category?.trim() || UNCATEGORISED;
}

/** Every category in the catalogue, sorted, de-duplicated. */
export function cropCategories(crops: readonly Crop[] | undefined): string[] {
  return Array.from(new Set((crops ?? []).map(categoryOf))).sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Fold a string for searching: lower case, and without combining marks.
 *
 * Kinyarwanda crop names are written both ways in the sources, and a reader
 * typing on a phone keyboard is unlikely to produce the accented form, so the
 * query and the values are folded the same way.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface CropQuery {
  /** Free text matched against the English name, Kinyarwanda name and code. */
  query?: string;
  /** Exact category to narrow to, or null/empty for all categories. */
  category?: string | null;
}

/**
 * Filter the catalogue by free text and category.
 *
 * Text matches the English name, the Kinyarwanda name **and** the code, so a
 * reader who knows the crop as "Ibigori" finds the same entry as one who knows it
 * as "Maize" — otherwise the catalogue is only searchable in one language.
 *
 * Ordering is preserved from the input: the catalogue is already sorted by the
 * caller, and this function neither ranks crops nor sorts them by any measured
 * value. Ranking crops by yield across species would compare values that share
 * no natural scale.
 */
export function filterCrops(
  crops: readonly Crop[] | undefined,
  { query, category }: CropQuery = {},
): Crop[] {
  const needles = fold(query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const wanted = category?.trim() || null;

  return (crops ?? []).filter((crop) => {
    if (wanted && categoryOf(crop) !== wanted) return false;
    if (needles.length === 0) return true;
    const haystack = fold(
      [crop.crop_name, crop.kinyarwanda_name ?? "", crop.crop_code ?? ""].join(" "),
    );
    // Every term must match somewhere, so "maize nyanza" cannot match by accident.
    return needles.every((needle) => haystack.includes(needle));
  });
}

/** Group the catalogue by category, each group sorted by crop name. */
export function groupCropsByCategory(crops: readonly Crop[] | undefined): CropGroup[] {
  const byCategory = new Map<string, Crop[]>();
  for (const crop of crops ?? []) {
    const key = categoryOf(crop);
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
