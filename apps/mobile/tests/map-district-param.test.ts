import { describe, expect, it } from "vitest";

import { resolveDistrictRouteParam } from "../src/utils/selection";

const CATALOGUE = [
  { district_code: "KGL" },
  { district_code: "HUY" },
  { district_code: "MUS" },
];

describe("resolveDistrictRouteParam", () => {
  it("selects a code that is in the published catalogue", () => {
    expect(resolveDistrictRouteParam("HUY", CATALOGUE)).toEqual({ action: "select", code: "HUY" });
  });

  it("reports a code that is not a district as unknown, never as unpublished", () => {
    expect(resolveDistrictRouteParam("ZZZ", CATALOGUE)).toEqual({ action: "unknown", code: "ZZZ" });
  });

  it("ignores a missing param", () => {
    expect(resolveDistrictRouteParam(null, CATALOGUE)).toEqual({ action: "ignore", code: null });
    expect(resolveDistrictRouteParam(undefined, CATALOGUE)).toEqual({ action: "ignore", code: null });
    expect(resolveDistrictRouteParam("", CATALOGUE)).toEqual({ action: "ignore", code: null });
  });

  it("treats every catalogue district as selectable, including unpublished ones", () => {
    // Whether the district has a value for the current layer is decided by the
    // response, not by this check: a real district with no value still opens
    // its sheet and says "Not published".
    for (const item of CATALOGUE) {
      expect(resolveDistrictRouteParam(item.district_code, CATALOGUE).action).toBe("select");
    }
  });
});
