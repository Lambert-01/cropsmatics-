import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  PREFERENCES_VERSION,
  loadPreferences,
  mergePreferences,
  normalizePreferences,
  resolveAnalyticalContext,
  savePreferences,
  type PreferenceStorage,
  type Preferences,
} from "@/lib/preferences";

/** A minimal in-memory Storage stand-in, so no jsdom is required. */
function memoryStorage(seed: Record<string, string> = {}): PreferenceStorage & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function prefs(patch: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFERENCES, ...patch };
}

describe("preference normalisation", () => {
  it("falls back to the defaults for a non-object", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences("nonsense")).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it("discards a payload written by a different version rather than guessing", () => {
    const stale = { ...DEFAULT_PREFERENCES, version: PREFERENCES_VERSION + 1, compactTables: true };
    expect(normalizePreferences(stale)).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps a default for a field of the wrong type", () => {
    const out = normalizePreferences({
      version: PREFERENCES_VERSION,
      compactTables: "yes",
      reducedMotion: 1,
      defaultPeriod: 2026,
    });
    expect(out.compactTables).toBe(DEFAULT_PREFERENCES.compactTables);
    expect(out.reducedMotion).toBe(DEFAULT_PREFERENCES.reducedMotion);
    expect(out.defaultPeriod).toBeNull();
  });

  it("treats a blank string as no selection, not as a value", () => {
    const out = normalizePreferences({ version: PREFERENCES_VERSION, defaultCrop: "   " });
    expect(out.defaultCrop).toBeNull();
  });

  it("keeps a valid value through normalisation", () => {
    const out = normalizePreferences({
      version: PREFERENCES_VERSION,
      defaultPeriod: "2026B",
      defaultCrop: "Maize",
      numberGrouping: "plain",
      showSources: false,
      mapLabels: false,
    });
    expect(out.defaultPeriod).toBe("2026B");
    expect(out.defaultCrop).toBe("Maize");
    expect(out.numberGrouping).toBe("plain");
    expect(out.showSources).toBe(false);
    expect(out.mapLabels).toBe(false);
  });
});

describe("preference persistence", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const saved = prefs({ defaultDistrict: "Bugesera", compactTables: true });
    savePreferences(storage, saved);
    expect(loadPreferences(storage)).toEqual(saved);
  });

  it("returns the defaults when nothing is stored", () => {
    expect(loadPreferences(memoryStorage())).toEqual(DEFAULT_PREFERENCES);
  });

  it("survives corrupt JSON instead of throwing", () => {
    const storage = memoryStorage({ [PREFERENCES_KEY]: "{not json" });
    expect(() => loadPreferences(storage)).not.toThrow();
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it("survives a storage that throws (private browsing quota)", () => {
    const throwing: PreferenceStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(loadPreferences(throwing)).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences(throwing, DEFAULT_PREFERENCES)).not.toThrow();
  });

  it("treats a missing storage as no preferences", () => {
    expect(loadPreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("merging a patch", () => {
  it("applies the patch and keeps the rest", () => {
    const next = mergePreferences(prefs({ defaultCrop: "Maize" }), { compactTables: true });
    expect(next.compactTables).toBe(true);
    expect(next.defaultCrop).toBe("Maize");
  });

  it("drops a key this build does not know about", () => {
    const next = mergePreferences(DEFAULT_PREFERENCES, {
      // A field from a future build must not survive into the stored value.
      somethingNew: true,
    } as Partial<Preferences>);
    expect(next).not.toHaveProperty("somethingNew");
  });

  it("re-stamps the version so the stored payload is always current", () => {
    const next = mergePreferences(prefs({ version: 0 }), {});
    expect(next.version).toBe(PREFERENCES_VERSION);
  });

  it("re-normalises invalid patched values", () => {
    const next = mergePreferences(DEFAULT_PREFERENCES, { defaultDistrict: "" });
    expect(next.defaultDistrict).toBeNull();
  });
});

describe("default analytical context", () => {
  it("uses the stored defaults when the URL carries nothing", () => {
    const context = resolveAnalyticalContext(
      prefs({
        defaultPeriod: "2026B",
        defaultCrop: "Maize",
        defaultProvince: "Eastern",
        defaultDistrict: "Bugesera",
      }),
      {},
    );
    expect(context).toEqual({
      period: "2026B",
      crop: "Maize",
      province: "Eastern",
      district: "Bugesera",
    });
  });

  it("lets an explicit URL selection win, so a shared link is faithful", () => {
    const context = resolveAnalyticalContext(
      prefs({ defaultPeriod: "2026B", defaultCrop: "Maize", defaultDistrict: "Bugesera" }),
      { period: "2025A", crop: "Beans", district: "Nyagatare" },
    );
    expect(context.period).toBe("2025A");
    expect(context.crop).toBe("Beans");
    expect(context.district).toBe("Nyagatare");
  });

  it("does not layer a default period on top of a legacy year+season link", () => {
    const context = resolveAnalyticalContext(prefs({ defaultPeriod: "2026B" }), {
      year: 2024,
      season: "C",
    });
    expect(context.period).toBe("2024C");
  });

  it("still fills a crop the legacy link did not name", () => {
    const context = resolveAnalyticalContext(prefs({ defaultCrop: "Maize" }), {
      year: 2024,
      season: "C",
    });
    expect(context.period).toBe("2024C");
    expect(context.crop).toBe("Maize");
  });

  it("applies the default district when it belongs to the effective province", () => {
    const context = resolveAnalyticalContext(
      prefs({ defaultProvince: "Eastern", defaultDistrict: "Bugesera" }),
      {},
    );
    expect(context.district).toBe("Bugesera");
  });

  it("refuses a default district from a different province than the link names", () => {
    // Otherwise a link that names one province would come back carrying a
    // district from another -- not a valid selection at all.
    const context = resolveAnalyticalContext(
      prefs({ defaultProvince: "Eastern", defaultDistrict: "Bugesera" }),
      { province: "Northern" },
    );
    expect(context.province).toBe("Northern");
    expect(context.district).toBeUndefined();
  });

  it("refuses a default district when the link names any other province", () => {
    const context = resolveAnalyticalContext(prefs({ defaultDistrict: "Bugesera" }), {
      province: "Southern",
    });
    expect(context.district).toBeUndefined();
  });

  it("leaves everything unset when there are no defaults", () => {
    expect(resolveAnalyticalContext(DEFAULT_PREFERENCES, {})).toEqual({
      period: undefined,
      crop: undefined,
      province: undefined,
      district: undefined,
    });
  });
});
