/**
 * Bottom-navigation model.
 *
 * One place decides which of the five destinations a route belongs to, so the
 * tab bar, the tests and deep-link handling all agree. Kept pure (no Expo Router
 * import) so it is testable in a plain node environment.
 *
 * The five destinations are Home, Crops, Analyze, Map and Ask. "Analyze" is the
 * analytical hub; comparing is one of the things you can do there, not the tab
 * itself, so the tab no longer doubles as the comparison screen.
 *
 * More is deliberately NOT a destination any more. It is a menu reached from the
 * header on every primary screen (see `MENU_ROOTS`), which is what keeps field
 * operations, saved items and settings one tap away without spending a permanent
 * slot in a five-slot bar.
 */

export type TabId = "home" | "crops" | "analyze" | "map" | "ask";

export interface TabDefinition {
  id: TabId;
  /** i18n key resolved by the tab bar. Every tab id is also a strings key. */
  labelKey: TabId;
  /** Destination the tab navigates to. */
  href: string;
}

/** The destinations of the bottom bar, in order. */
export const TABS: readonly TabDefinition[] = [
  { id: "home", labelKey: "home", href: "/" },
  { id: "crops", labelKey: "crops", href: "/explore/crops" },
  { id: "analyze", labelKey: "analyze", href: "/explore/analyze" },
  { id: "map", labelKey: "map", href: "/maps" },
  { id: "ask", labelKey: "ask", href: "/ask" },
] as const;

/**
 * Routes reached from the header menu rather than from a tab.
 *
 * Listed explicitly so it is checkable that nothing became unreachable when More
 * left the tab bar: every screen under these roots is still in the menu tree.
 */
export const MENU_ROOTS: readonly string[] = [
  "more",
  "explore",
  "ask",
  "saved",
  "inquiry",
  "field-operations",
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

/**
 * The tab a route belongs to, given its Expo Router path segments.
 *
 * `segments` is what `useSegments()` returns: `[]` at the root, `["explore",
 * "crop", "[cropCode]"]` on a crop detail.
 *
 * `null` means "no tab" and is the honest answer for two different situations:
 * a screen that is not a destination at all (`/more`, field operations) and a
 * route nobody has classified. Highlighting Home for those would tell the user
 * they are somewhere they are not, which is worse than highlighting nothing.
 */
export function activeTabForSegments(segments: readonly string[]): TabId | null {
  const [root, section] = segments;
  if (!root || root === "index") return "home";
  if (root === "explore") {
    // Compare is something you do in Analyze, and the hub itself is Analyze.
    if (section === "analyze" || section === "compare") return "analyze";
    if (section && CROPS_SECTIONS.has(section)) return "crops";
    return null;
  }
  if (root === "maps") return "map";
  if (root === "ask") return "ask";
  if (root === "onboarding") return "home";
  return null;
}

/** Convenience for a screen that already knows its tab id. */
export function tabHref(id: TabId): string {
  return TABS.find((tab) => tab.id === id)?.href ?? "/";
}

/**
 * Legacy/route `active` ids that screens pass, mapped to the destinations.
 *
 * Screens were written before the tab model existed and pass ids such as
 * `"explore"` or `"compare"`. The ones that still name a destination are
 * normalised here. Ids that no longer name one on purpose - `more`, `alerts`,
 * `profile`, `saved` - are deliberately absent, so the tab bar falls back to the
 * router's own segments rather than to a guess.
 */
const ACTIVE_ALIASES: Record<string, TabId> = {
  home: "home",
  crops: "crops",
  crop: "crops",
  compare: "analyze",
  analyze: "analyze",
  map: "map",
  maps: "map",
  ask: "ask",
};

/**
 * Resolve a screen's explicit `active` id to a tab, or `null` when the id does
 * not name a destination.
 *
 * `null` is not an error: the caller (`BottomNav`) then asks
 * `activeTabForSegments` what the current route actually is, which is more
 * accurate than any hard-coded string on the screen.
 */
export function normalizeActiveTab(active: string | null | undefined): TabId | null {
  if (!active) return null;
  return ACTIVE_ALIASES[active] ?? null;
}
