/**
 * Crop catalogue helpers.
 *
 * Pure and synchronous so the two presentation rules the crop pages depend on are
 * testable without a renderer: which catalogue entry a URL slug names, and how the
 * catalogue is grouped. Neither invents a crop — an unknown slug resolves to
 * `undefined`, which the page renders as "not found" rather than as an empty
 * page that looks like a data outage.
 */

import type { Crop, NationalBoardCrop } from "@/types";

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

/* ------------------------------------------------------------------ */
/* Crop summaries (national board)                                     */
/* ------------------------------------------------------------------ */

/**
 * The metrics a catalogue summary shows, in display order.
 *
 * Cultivated area is deliberately absent: harvested area is what production
 * and yield are actually computed against, and showing both invites a reader
 * to compare two area figures that answer different questions.
 */
export const SUMMARY_METRICS = ["production_mt", "harvested_area_ha", "yield_mt_ha"] as const;

const SUMMARY_LABELS: Record<string, string> = {
  production_mt: "Production",
  harvested_area_ha: "Harvested area",
  yield_mt_ha: "Yield",
};

export interface CropSummaryMetric {
  metric: string;
  label: string;
  /** The latest published value inside the requested scope; null = not published. */
  value: number | null;
  unit: string | null;
  /** The release the value describes (from the server, never guessed here). */
  periodCode: string | null;
  periodLabel: string | null;
  /** Same-season delta in percent; null when the server could not compute one. */
  changePct: number | null;
  changeAvailable: boolean;
  /** Why no change is shown ("no published value", "no same-season prior…"). */
  changeReason: string | null;
}

/**
 * Present one board crop as summary chips.
 *
 * Pure projection of what the server already computed: the value, its period
 * and the same-season change all come from the board's own `changes` block, so
 * a catalogue card can never disagree with the API about either. A metric the
 * release did not tabulate comes back as `value: null` and is rendered as
 * "not published" — never as a zero.
 */
export function cropSummaries(
  crop: NationalBoardCrop | undefined,
  units: Record<string, string> = {},
): CropSummaryMetric[] {
  if (!crop) return [];
  return SUMMARY_METRICS.map((metric) => {
    const change = crop.changes?.[metric];
    return {
      metric,
      label: SUMMARY_LABELS[metric] ?? metric,
      value: change?.current_value ?? null,
      unit: units[metric] ?? change?.unit ?? null,
      periodCode: change?.period_code ?? null,
      periodLabel: change?.period_label ?? null,
      changePct: change?.available ? (change.change_pct ?? null) : null,
      changeAvailable: Boolean(change?.available),
      changeReason: change?.available ? null : (change?.reason ?? null),
    };
  });
}

/**
 * One line describing whether this crop published anything in the requested
 * scope — the catalogue's answer to "is this crop even covered here?".
 *
 * With the full published axis it is a coverage fraction ("12 of 14 periods");
 * scoped to one release it names that release, or says plainly that the crop
 * has nothing published for it. The numbers are the board's own counts.
 */
export function cropAvailability(
  crop: NationalBoardCrop | undefined,
  axisLength: number,
): { published: boolean; text: string } {
  if (!crop) return { published: false, text: "coverage not reported" };
  const published = crop.n_published_periods > 0;
  if (axisLength === 1) {
    return published
      ? { published: true, text: `Published in ${crop.latest_published_label ?? "this period"}` }
      : { published: false, text: "Not published for this period" };
  }
  if (!published) return { published: false, text: "No published periods" };
  return {
    published: true,
    text:
      axisLength > 0
        ? `${crop.n_published_periods} of ${axisLength} periods`
        : `${crop.n_published_periods} published periods`,
  };
}

/* ------------------------------------------------------------------ */
/* Saved crops                                                         */
/* ------------------------------------------------------------------ */

export const SAVED_CROPS_KEY = "cropmatics-saved-crops";

/** The subset of the Storage API this module needs (keeps it testable). */
export interface SavedCropStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Read saved crop codes, tolerating absent, corrupt or stale entries.
 *
 * Same contract as `lib/preferences`: an unreadable entry falls back to an
 * empty list rather than throwing, and only non-blank strings survive — a
 * hand-edited entry cannot inject an object into the saved list.
 */
export function loadSavedCrops(storage: SavedCropStorage | null | undefined): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SAVED_CROPS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(parsed.filter((code): code is string => typeof code === "string" && code.trim() !== "")),
    );
  } catch {
    return [];
  }
}

export function saveSavedCrops(storage: SavedCropStorage | null | undefined, codes: readonly string[]): void {
  if (!storage) return;
  try {
    storage.setItem(SAVED_CROPS_KEY, JSON.stringify(codes));
  } catch {
    // Private-browsing quota errors must not break the page.
  }
}

/** Add the crop if absent, remove it if present — returns the next list. */
export function toggleSavedCrop(saved: readonly string[], code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) return [...saved];
  return saved.includes(trimmed)
    ? saved.filter((existing) => existing !== trimmed)
    : [...saved, trimmed];
}
