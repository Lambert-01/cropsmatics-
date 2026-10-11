import { describe, expect, it } from "vitest";

import { DICT } from "@/lib/i18n";
import { NAV_GROUPS, type NavItem } from "@/lib/navigation";

const ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

describe("navigation labels", () => {
  it("resolves every destination through a key the dictionary actually has", () => {
    // The sidebar used to build its key from the href, so `/dashboard` asked for
    // `nav.dashboard` - which does not exist - and the sidebar rendered the raw
    // key. Deriving a translation key from a URL is the bug; this holds the line.
    const missing = ITEMS.filter(
      (item) => !DICT.en[item.labelKey] || !DICT.rw[item.labelKey],
    ).map((item) => `${item.href} -> ${item.labelKey}`);
    expect(missing).toEqual([]);
  });

  it("labels /dashboard as Overview, not by deriving nav.dashboard", () => {
    const dashboard = ITEMS.find((item) => item.href === "/dashboard");
    expect(dashboard?.labelKey).toBe("nav.overview");
    expect(DICT.en["nav.dashboard"]).toBeUndefined();
  });

  it("keeps every navigation group label translated", () => {
    const missing = NAV_GROUPS.filter(
      (group) => !DICT.en[`group.${group.label}`] || !DICT.rw[`group.${group.label}`],
    ).map((group) => group.label);
    expect(missing).toEqual([]);
  });

  it("has an href and a non-empty label for every destination", () => {
    for (const item of ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });
});
