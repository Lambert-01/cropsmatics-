/**
 * Bottom-navigation model.
 *
 * One place decides which of the five destinations a route belongs to, so the
 * tab bar, the tests and any future deep-link handling all agree. Kept pure (no
 * Expo Router import) so it is testable in a plain node environment.
 *
 * The five destinations are Home, Crops, Analyze, Map and More. "Analyze" is the
 * user-facing label for the comparison workspace; the route stays
 * `/explore/compare` so existing deep links keep working.
 */

export type TabId = "home" | "crops" | "analyze" | "map" | "more";

export interface TabDefinition {
  id: TabId;
  /** i18n key resolved by the tab bar. */
  labelKey: "home" | "crops" | "analyze" | "map" | "more";
  /** Destination the tab navigates to. */
  href: string;
}

/** The destinations of the bottom bar, in order. */
export const TABS: readonly TabDefinition[] = [
  { id: "home", labelKey: "home", href: "/" },
  { id: "crops", labelKey: "crops", href: "/explore/crops" },
  { id: "analyze", labelKey: "analyze", href: "/explore/compare" },
  { id: "map", labelKey: "map", href: "/maps" },
  { id: "more", labelKey: "more", href: "/more" },
] as const;

/** Sections under `/explore` that belong to the Crops destination. */
const CROPS_SECTIONS = new Set([
  "crops",
  "crop",
  "districts",
  "district",
  "indicators",
  "post-harvest",
]);

/** Routes that are destinations reached from the More tab. */
const MORE_ROOTS = new Set(["more", "ask", "field-operations", "saved", "inquiry"]);

/**
 * The tab a route belongs to, given its Expo Router path segments.
 *
 * `segments` is what `useSegments()` returns: `[]` at the root, `["explore",
 * "crop", "[cropCode]"]` on a crop detail. An unknown route falls back to Home
 * rather than to a highlighted tab the user did not come from.
 */
export function activeTabForSegments(segments: readonly string[]): TabId {
  const [root, section] = segments;
  if (!root || root === "index") return "home";
  if (root === "explore") {
    if (section === "compare") return "analyze";
    if (section && CROPS_SECTIONS.has(section)) return "crops";
    return "home";
  }
  if (root === "maps") return "map";
  if (MORE_ROOTS.has(root)) return "more";
  if (root === "onboarding") return "home";
  return "home";
}

/** Convenience for a screen that already knows its tab id. */
export function tabHref(id: TabId): string {
  return TABS.find((tab) => tab.id === id)?.href ?? "/";
}

/**
 * Legacy/route `active` ids that screens pass, mapped to the five destinations.
 *
 * Screens were written before the tab model existed and pass ids such as
 * `"explore"` or `"compare"`. Rather than edit every screen, the tab bar
 * normalises them here so the same destination is highlighted whether it was
 * reached by tab or by deep link.
 */
const ACTIVE_ALIASES: Record<string, TabId> = {
  home: "home",
  crops: "crops",
  crop: "crops",
  explore: "crops",
  compare: "analyze",
  analyze: "analyze",
  map: "map",
  maps: "map",
  more: "more",
  ask: "more",
  saved: "more",
  inquiry: "more",
  harvests: "more",
  insights: "more",
  profile: "more",
  alerts: "more",
  "field-operations": "more",
};

/**
 * Resolve a screen's `active` id to a tab, or `null` for no highlight.
 *
 * Returning `null` for an unknown id is deliberate: a tab bar that highlights
 * the wrong destination is worse than one that highlights none.
 */
export function normalizeActiveTab(active: string | null | undefined): TabId | null {
  if (!active) return null;
  return ACTIVE_ALIASES[active] ?? null;
}
