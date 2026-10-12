import { describe, expect, it } from "vitest";
import { activeTabForSegments, MENU_ROOTS, normalizeActiveTab, TABS, tabHref } from "../src/utils/navigation";
import { FIELD_OPERATIONS_ITEM, MENU_GROUPS, menuRoot } from "../src/utils/menu";
import { resolveOnboardingRoute, shouldStartInOnboarding, type OnboardingState } from "../src/utils/onboarding";

// merged from navigation-state.test.ts
describe("bottom navigation destinations", () => {
  it("has exactly the five documented destinations in order", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["home", "crops", "analyze", "map", "ask"]);
  });

  it("maps each destination to a stable, non-accumulating href", () => {
    expect(tabHref("analyze")).toBe("/explore/analyze");
    expect(tabHref("map")).toBe("/maps");
    expect(tabHref("ask")).toBe("/ask");
    // A tab is always a concrete route, never the current one.
    for (const tab of TABS) expect(tab.href.startsWith("/")).toBe(true);
  });

  it("gives Ask a destination of its own", () => {
    // The assistant is a way into the data, not a settings item: it used to be
    // reachable only from the More menu.
    const ids: string[] = TABS.map((tab) => tab.id);
    expect(ids).toContain("ask");
    expect(ids).not.toContain("more");
  });
});

describe("activeTabForSegments", () => {
  it("marks Home at the root", () => {
    expect(activeTabForSegments([])).toBe("home");
    expect(activeTabForSegments(["index"])).toBe("home");
  });

  it("marks Crops for the crop catalogue, a crop detail and a district detail", () => {
    expect(activeTabForSegments(["explore", "crops"])).toBe("crops");
    expect(activeTabForSegments(["explore", "crop", "[cropCode]"])).toBe("crops");
    expect(activeTabForSegments(["explore", "districts"])).toBe("crops");
    expect(activeTabForSegments(["explore", "district", "[districtCode]"])).toBe("crops");
  });

  it("marks Analyze for the hub and for the comparison workspace", () => {
    expect(activeTabForSegments(["explore", "analyze"])).toBe("analyze");
    expect(activeTabForSegments(["explore", "compare"])).toBe("analyze");
  });

  it("marks Map for the map and a map district detail", () => {
    expect(activeTabForSegments(["maps"])).toBe("map");
    expect(activeTabForSegments(["maps", "district", "[districtCode]"])).toBe("map");
  });

  it("marks Ask for the assistant", () => {
    expect(activeTabForSegments(["ask"])).toBe("ask");
  });

  it("highlights nothing for a screen that is not a destination", () => {
    // More is a menu in the header now. Highlighting Home - or a stale tab -
    // would tell the user they are somewhere they are not.
    expect(activeTabForSegments(["more"])).toBeNull();
    expect(activeTabForSegments(["more", "settings"])).toBeNull();
    expect(activeTabForSegments(["field-operations", "sync"])).toBeNull();
    expect(activeTabForSegments(["saved"])).toBeNull();
  });

  it("highlights nothing for an unclassified route", () => {
    expect(activeTabForSegments(["explore", "search"])).toBeNull();
    expect(activeTabForSegments(["totally-unknown"])).toBeNull();
  });
});

describe("normalizeActiveTab", () => {
  it("maps the ids a screen still passes onto the five destinations", () => {
    expect(normalizeActiveTab("compare")).toBe("analyze");
    expect(normalizeActiveTab("ask")).toBe("ask");
    expect(normalizeActiveTab("home")).toBe("home");
    expect(normalizeActiveTab("map")).toBe("map");
    expect(normalizeActiveTab("crop")).toBe("crops");
  });

  it("returns null for an id that no longer names a destination", () => {
    // The caller falls back to the route's own segments instead of guessing.
    expect(normalizeActiveTab("more")).toBeNull();
    expect(normalizeActiveTab("explore")).toBeNull();
    expect(normalizeActiveTab("alerts")).toBeNull();
    expect(normalizeActiveTab("nonsense")).toBeNull();
    expect(normalizeActiveTab(undefined)).toBeNull();
  });
});

describe("More menu reachability", () => {
  const allItems = [...MENU_GROUPS.flatMap((group) => group.items), FIELD_OPERATIONS_ITEM];

  it("keeps every menu destination reachable", () => {
    // More lost its tab slot. Nothing it held may become unreachable, so each
    // entry must either be a tab destination itself or sit under a root the
    // navigation model explicitly knows about.
    const tabHrefs = new Set(TABS.map((tab) => tab.href));
    const strays = allItems
      .filter((item) => !tabHrefs.has(item.href))
      .map((item) => menuRoot(item.href))
      .filter((root) => !MENU_ROOTS.includes(root));
    expect(strays).toEqual([]);
  });

  it("lists every item exactly once", () => {
    const hrefs = allItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("uses a label key and an icon for every entry", () => {
    for (const item of allItems) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/")).toBe(true);
    }
  });
});


// merged from onboarding-state.test.ts
const state = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  hydrated: false,
  onboardingComplete: false,
  ...overrides,
});

describe("resolveOnboardingRoute", () => {
  it("waits for hydration before deciding anything", () => {
    expect(resolveOnboardingRoute(state(), [])).toBeNull();
  });

  it("sends a fresh session into onboarding once hydrated", () => {
    expect(resolveOnboardingRoute(state({ hydrated: true }), [])).toBe("/onboarding");
  });

  it("does not redirect a session that is already inside onboarding", () => {
    expect(resolveOnboardingRoute(state({ hydrated: true }), ["onboarding"])).toBeNull();
  });

  it("lets a completed session through to the app", () => {
    expect(
      resolveOnboardingRoute(state({ hydrated: true, onboardingComplete: true }), []),
    ).toBeNull();
  });

  it("keeps a completed session out of onboarding even if it deep-links there", () => {
    // Returning to /onboarding after completion is allowed to render, but the
    // guard must not force a *new* redirect loop.
    expect(
      resolveOnboardingRoute(state({ hydrated: true, onboardingComplete: true }), ["onboarding"]),
    ).toBeNull();
  });
});

describe("shouldStartInOnboarding", () => {
  it("is true only once hydrated and not yet complete", () => {
    expect(shouldStartInOnboarding(state())).toBe(false);
    expect(shouldStartInOnboarding(state({ hydrated: true }))).toBe(true);
    expect(shouldStartInOnboarding(state({ hydrated: true, onboardingComplete: true }))).toBe(false);
  });

  it("models the Skip outcome: once marked complete, the next launch starts in the app", () => {
    // Skip must set onboardingComplete = true; this is the state that results.
    const afterSkip: OnboardingState = { hydrated: true, onboardingComplete: true };
    expect(resolveOnboardingRoute(afterSkip, [])).toBeNull();
    expect(shouldStartInOnboarding(afterSkip)).toBe(false);
  });
});
