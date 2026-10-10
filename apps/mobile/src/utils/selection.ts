/**
 * Pure rules for multi-entity comparison selection.
 *
 * The comparison workspace (crops or districts) enforces a maximum selection by
 * *ignoring* taps beyond the limit — it never silently evicts an earlier choice,
 * because a dropped selection is a change the user did not ask for. These rules
 * are pure so the sheet, the tray and the chart all behave identically and can
 * be tested without a renderer.
 */

/** Add `value` if absent and there is room; remove it if already selected. */
export function toggleSelection(
  list: readonly string[],
  value: string,
  max: number,
): string[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (list.length >= max) return [...list];
  return [...list, value];
}

/** True once the selection is big enough to request a multi-series response. */
export function canCompare(list: readonly string[], min = 2): boolean {
  return list.length >= min;
}

/** True once the selection is at its ceiling, so further taps are inert. */
export function isSelectionFull(list: readonly string[], max: number): boolean {
  return list.length >= max;
}

/**
 * Substring filter over a labelled entity list.
 *
 * An empty query returns the list unchanged, so the sheet opens showing every
 * published option rather than an empty pane. `normalize` defaults to a
 * lower-case trim and is overridable so a caller can fold diacritics (the crop
 * and district catalogues both carry accented names).
 */
export function filterByLabel<T extends { label: string }>(
  items: readonly T[],
  query: string,
  normalize: (text: string) => string = (text) => text.trim().toLowerCase(),
): T[] {
  const needle = normalize(query);
  if (!needle) return [...items];
  return items.filter((item) => normalize(item.label).includes(needle));
}

// ---- comparison selection across route remounts ------------------------------

/** The comparison workspace's selection, kept in memory across route remounts. */
export interface CompareSelection {
  mode: "crops" | "districts";
  crops: string[];
  districts: string[];
  /** The crop whose district rows the districts mode examines. */
  compareCrop: string | null;
}

export const EMPTY_COMPARE_SELECTION: CompareSelection = {
  mode: "crops",
  crops: [],
  districts: [],
  compareCrop: null,
};

/** Split a comma-list route param into clean ids. */
export function parseParamList(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value;
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface CompareRouteParams {
  mode?: string | string[] | null;
  crop?: string | string[] | null;
  crops?: string | string[] | null;
  district?: string | string[] | null;
  districts?: string | string[] | null;
}

function singleParam(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Merge deep-link / quick-comparison params into the last selection.
 *
 * A quick comparison (or the map's Compare action) remounts Compare from
 * scratch, so the route params alone would throw away whatever the user had
 * already picked. Route ids take the front of the list — they are the choice
 * the user just made — and the stored ids fill the remaining slots up to the
 * documented limit. Nothing is evicted to make room beyond that limit.
 */
export function mergeCompareSelection(
  stored: CompareSelection,
  params: CompareRouteParams,
  limits: { maxCrops: number; maxDistricts: number },
): CompareSelection {
  const modeParam = singleParam(params.mode);
  const mode: CompareSelection["mode"] =
    modeParam === "districts" ? "districts" : modeParam === "crops" ? "crops" : stored.mode;
  const singleCrop = singleParam(params.crop);
  const singleDistrict = singleParam(params.district);
  const routeCrops = [...parseParamList(params.crops), ...(singleCrop ? [singleCrop] : [])];
  const routeDistricts = [
    ...parseParamList(params.districts),
    ...(singleDistrict ? [singleDistrict] : []),
  ];

  const merge = (route: string[], existing: string[], max: number): string[] => {
    const merged: string[] = [];
    for (const id of [...route, ...existing]) {
      if (!merged.includes(id) && merged.length < max) merged.push(id);
    }
    return merged;
  };

  return {
    mode,
    crops: merge(routeCrops, stored.crops, limits.maxCrops),
    districts: merge(routeDistricts, stored.districts, limits.maxDistricts),
    compareCrop: singleCrop ?? stored.compareCrop,
  };
}

// ---- map district deep links ------------------------------------------------

export interface DistrictRouteDecision {
  /** "select": open the district's sheet. "unknown": the code is not a district. "ignore": no param. */
  action: "select" | "unknown" | "ignore";
  code: string | null;
}

/**
 * Decide what a `?district=` deep link means.
 *
 * A code that is not in the published catalogue is unknown and must be
 * reported as such — it is not the same as a real district whose value simply
 * is not published for the current layer, which still gets the detail sheet
 * ("Not published" honestly shown).
 */
export function resolveDistrictRouteParam(
  param: string | null | undefined,
  catalogue: readonly { district_code: string }[],
): DistrictRouteDecision {
  if (!param) return { action: "ignore", code: null };
  const known = catalogue.some((item) => item.district_code === param);
  return { action: known ? "select" : "unknown", code: param };
}
