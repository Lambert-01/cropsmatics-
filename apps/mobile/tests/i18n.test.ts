import { describe, expect, it } from "vitest";

import { CROPS, DISTRICTS } from "../src/constants/reference";
import { en, fr, rw, strings } from "../src/i18n";
import { PENDING_KINYARWANDA_REVIEW, SHARED_BY_DESIGN } from "../src/i18n/pending-review";
import { uuidv4 } from "../src/utils/uuid";

/** Keys whose Kinyarwanda value is byte-identical to the English one. */
const untranslatedKeys = Object.keys(en).filter((key) => en[key as keyof typeof en] === rw[key as keyof typeof rw]);

describe("i18n", () => {
  it("has matching keys in every language", () => {
    expect(Object.keys(rw).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty or whitespace-only values", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), `en.${key}`).not.toBe("");
    }
    for (const [key, value] of Object.entries(rw)) {
      expect(value.trim(), `rw.${key}`).not.toBe("");
    }
    for (const [key, value] of Object.entries(fr)) {
      expect(value.trim(), `fr.${key}`).not.toBe("");
    }
  });

  it("preserves placeholder tokens across languages", () => {
    const tokens = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      // A translated string must keep every {placeholder} the English carries,
      // otherwise a .replace() at the call site silently does nothing.
      expect(tokens(rw[key]), `rw.${key}`).toEqual(tokens(en[key]));
    }
  });

  // ---- Kinyarwanda coverage -------------------------------------------------
  //
  // Key parity alone does not prove a language is translated: a Kinyarwanda
  // dictionary that is entirely English satisfies it. These two assertions turn
  // the remaining gap into an explicit ledger (src/i18n/pending-review.ts) that
  // cannot silently grow *or* silently go stale.

  it("has no untranslated key that is not on the ledger", () => {
    const ledger = new Set([...PENDING_KINYARWANDA_REVIEW, ...SHARED_BY_DESIGN]);
    const untracked = untranslatedKeys.filter((key) => !ledger.has(key));
    expect(
      untracked,
      `New string(s) shipped with English text in the Kinyarwanda build: ${untracked.join(", ")}. ` +
        "Translate them, or add them to PENDING_KINYARWANDA_REVIEW with a reason.",
    ).toEqual([]);
  });

  it("keeps the ledger free of keys that have since been translated", () => {
    const stillUntranslated = new Set(untranslatedKeys);
    const stale = [...PENDING_KINYARWANDA_REVIEW, ...SHARED_BY_DESIGN].filter(
      (key) => !stillUntranslated.has(key),
    );
    expect(
      stale,
      `Stale ledger entry (the value now differs from English, so remove it): ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps every ledger entry a real key", () => {
    const keys = new Set(Object.keys(en));
    for (const key of [...PENDING_KINYARWANDA_REVIEW, ...SHARED_BY_DESIGN]) {
      expect(keys.has(key), `ledger entry "${key}" is not a key in en.ts`).toBe(true);
    }
  });

  it("transcribes its own ledger", () => {
    // Docs claim the ledger is alphabetical; an unsorted one is unreviewable.
    expect([...PENDING_KINYARWANDA_REVIEW]).toEqual([...PENDING_KINYARWANDA_REVIEW].sort());
  });

  it("resolves language and falls back safely", () => {
    expect(strings("rw").save).toBe(rw.save);
    expect(strings("fr").save).toBe(fr.save);
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
