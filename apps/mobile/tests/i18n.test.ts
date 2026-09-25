import { describe, expect, it } from "vitest";

import { CROPS, DISTRICTS } from "../src/constants/reference";
import { en, rw, strings } from "../src/i18n";
import { uuidv4 } from "../src/utils/uuid";

describe("i18n", () => {
  it("has matching keys in every language", () => {
    expect(Object.keys(rw).sort()).toEqual(Object.keys(en).sort());
  });

  it("resolves language and falls back safely", () => {
    expect(strings("rw").save).toBe(rw.save);
    // @ts-expect-error unknown language falls back to English
    expect(strings("fr").save).toBe(en.save);
  });
});

describe("reference lists", () => {
  it("covers all 30 districts and the 17 crop categories", () => {
    expect(DISTRICTS).toHaveLength(30);
    expect(CROPS).toHaveLength(17);
    expect(new Set(DISTRICTS).size).toBe(30);
  });
});

describe("uuidv4", () => {
  it("produces RFC 4122 v4 shaped ids that are unique", () => {
    const a = uuidv4();
    const b = uuidv4();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
