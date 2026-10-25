import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceDisclosure } from "@/components/ui/SourceDisclosure";

const LONG_SOURCE_ID = Array.from(
  { length: 8 },
  (_, i) => `NISR_SAS_202${i % 4}B_DISTRICT_CROP_TABLE_${10 + i}`,
).join(",");

function render(children: string): string {
  return renderToStaticMarkup(createElement(SourceDisclosure, { children }));
}

describe("SourceDisclosure", () => {
  it("starts collapsed regardless of a previously saved source preference", () => {
    const html = render(LONG_SOURCE_ID);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Source and methodology");
    // Collapsed is closed, not deleted: the button keeps the detail reachable.
    expect(html).not.toContain("NISR_SAS");
  });
});
