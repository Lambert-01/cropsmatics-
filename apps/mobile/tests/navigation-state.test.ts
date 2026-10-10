import { describe, expect, it } from "vitest";

import {
  activeTabForSegments,
  normalizeActiveTab,
  TABS,
  tabHref,
} from "../src/utils/navigation";

describe("bottom navigation destinations", () => {
  it("has exactly the five documented destinations in order", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["home", "crops", "analyze", "map", "more"]);
  });

  it("maps each destination to a stable, non-accumulating href", () => {
    expect(tabHref("analyze")).toBe("/explore/compare");
    expect(tabHref("map")).toBe("/maps");
    // A tab is always a concrete route, never the current one.
    for (const tab of TABS) expect(tab.href.startsWith("/")).toBe(true);
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

  it("marks Analyze for the comparison workspace", () => {
    expect(activeTabForSegments(["explore", "compare"])).toBe("analyze");
  });

  it("marks Map for the map and a map district detail", () => {
    expect(activeTabForSegments(["maps"])).toBe("map");
    expect(activeTabForSegments(["maps", "district", "[districtCode]"])).toBe("map");
  });

  it("marks More for the more section and secondary destinations", () => {
    expect(activeTabForSegments(["more"])).toBe("more");
    expect(activeTabForSegments(["ask"])).toBe("more");
    expect(activeTabForSegments(["field-operations", "sync"])).toBe("more");
    expect(activeTabForSegments(["saved"])).toBe("more");
  });

  it("falls back to Home for an unknown route instead of a wrong highlight", () => {
    expect(activeTabForSegments(["explore", "search"])).toBe("home");
    expect(activeTabForSegments(["totally-unknown"])).toBe("home");
  });
});

describe("normalizeActiveTab", () => {
  it("maps the legacy screen ids onto the five destinations", () => {
    expect(normalizeActiveTab("explore")).toBe("crops");
    expect(normalizeActiveTab("compare")).toBe("analyze");
    expect(normalizeActiveTab("ask")).toBe("more");
    expect(normalizeActiveTab("alerts")).toBe("more");
    expect(normalizeActiveTab("home")).toBe("home");
    expect(normalizeActiveTab("map")).toBe("map");
  });

  it("returns null for an unknown id rather than highlighting the wrong tab", () => {
    expect(normalizeActiveTab("nonsense")).toBeNull();
    expect(normalizeActiveTab(undefined)).toBeNull();
  });
});
