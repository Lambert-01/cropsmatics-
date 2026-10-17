import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The disclosure renders differently for each provenance preference; the node
// render needs the value, not the whole provider with its storage side effects.
const preference = vi.hoisted(() => ({ showSources: true }));
vi.mock("@/components/providers/PreferencesProvider", () => ({
  usePreferences: () => ({ preferences: { showSources: preference.showSources } }),
}));

import { SourceDisclosure } from "@/components/ui/SourceDisclosure";

const LONG_SOURCE_ID = Array.from(
  { length: 8 },
  (_, i) => `NISR_SAS_202${i % 4}B_DISTRICT_CROP_TABLE_${10 + i}`,
).join(",");

function render(children: string): string {
  return renderToStaticMarkup(createElement(SourceDisclosure, { children }));
}

beforeEach(() => {
  preference.showSources = true;
});

describe("SourceDisclosure", () => {
  it("wraps long source identifiers instead of widening the document", () => {
    // The audit reproduction: this id list has no spaces, so an unbreakable
    // disclosure grew the page from 1440px to 1624px when expanded.
    const html = render(LONG_SOURCE_ID);
    expect(html).toContain(LONG_SOURCE_ID);
    // Both the shrink rule and the break rule sit on the expanded container.
    expect(html).toContain("break-words");
    expect(html).toContain("min-w-0");
    // Nothing is hidden by global clipping: the full text stays in the DOM.
    expect(html).not.toContain("overflow-hidden");
  });

  it("degrades to a labelled control while collapsed, keeping detail reachable", () => {
    preference.showSources = false;
    const html = render(LONG_SOURCE_ID);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Source and methodology");
    // Collapsed is closed, not deleted: no detail leaks into the layout, and
    // the control is what makes it reachable again.
    expect(html).not.toContain("NISR_SAS");
  });
});
