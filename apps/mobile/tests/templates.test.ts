import { describe, expect, it } from "vitest";

import { fillTemplate } from "../src/utils/templates";

describe("fillTemplate", () => {
  it("substitutes every named token", () => {
    expect(fillTemplate("{crop} is up {pct}% versus {prev}.", { crop: "Maize", pct: "12.0", prev: "2024B" })).toBe(
      "Maize is up 12.0% versus 2024B.",
    );
  });

  it("repeats a token used more than once", () => {
    expect(fillTemplate("{x}+{x}", { x: 2 })).toBe("2+2");
  });

  it("leaves an unknown token visible instead of emptying it", () => {
    expect(fillTemplate("{a} and {b}", { a: "one" })).toBe("one and {b}");
  });

  it("does not treat inherited object properties as values", () => {
    expect(fillTemplate("{toString}", {})).toBe("{toString}");
  });
});
