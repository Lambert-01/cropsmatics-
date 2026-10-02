/**
 * Global search: what a typed query should actually open.
 *
 * The header search used to only patch the shared filter state, so searching
 * "Nyagatare" changed hidden state and navigated nowhere. A suggestion now
 * carries a destination, and picking one *navigates* — which is what makes the
 * search box useful rather than a second, quieter filter control.
 *
 * The mapping is deliberately to pages that genuinely exist and read the scope:
 * a crop opens the productivity view for that crop, a district opens the map
 * centred on it, and a dataset name opens the Data Explorer on that dataset.
 * Nothing here invents a route.
 */

export type SearchKind = "crop" | "district" | "dataset";

export interface SearchCandidate {
  kind: SearchKind;
  /** The matched entity's own name/key. */
  value: string;
  /** How the match is shown to the reader. */
  label: string;
  /** Where selecting it goes. */
  href: string;
}

export interface SearchInputs {
  query: string;
  crops?: { name: string }[];
  districts?: { name: string }[];
  datasets?: { key: string; label: string }[];
  limit?: number;
}

/** The productivity view scoped to one crop. */
export function cropHref(name: string): string {
  return `/productivity?crop=${encodeURIComponent(name)}`;
}

/** The map scoped to one district. */
export function districtHref(name: string): string {
  return `/maps?district=${encodeURIComponent(name)}`;
}

/** The Data Explorer opened on one dataset. */
export function datasetHref(key: string): string {
  return `/data-explorer?dataset=${encodeURIComponent(key)}`;
}

const MIN_QUERY = 2;

function matches(needle: string, haystack: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/**
 * Ranked suggestions for a query.
 *
 * Crops come first, then districts, then datasets: a reader typing "ma" is far
 * more likely to want Maize than a dataset whose label happens to contain it.
 * Ordering within a group follows the catalogue, so the list is stable across
 * keystrokes rather than reshuffling.
 */
export function buildSuggestions({
  query,
  crops = [],
  districts = [],
  datasets = [],
  limit = 8,
}: SearchInputs): SearchCandidate[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];

  const candidates: SearchCandidate[] = [];

  for (const crop of crops) {
    if (matches(needle, crop.name)) {
      candidates.push({
        kind: "crop",
        value: crop.name,
        label: crop.name,
        href: cropHref(crop.name),
      });
    }
  }

  for (const district of districts) {
    if (matches(needle, district.name)) {
      candidates.push({
        kind: "district",
        value: district.name,
        label: district.name,
        href: districtHref(district.name),
      });
    }
  }

  for (const dataset of datasets) {
    if (matches(needle, dataset.label) || matches(needle, dataset.key)) {
      candidates.push({
        kind: "dataset",
        value: dataset.key,
        label: dataset.label,
        href: datasetHref(dataset.key),
      });
    }
  }

  return candidates.slice(0, Math.max(1, limit));
}
