import { describe, expect, it } from "vitest";

import { DEFAULTS_NONE, SCOPE_HISTORY, SCOPE_PERIOD } from "@/lib/filters";
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
      view: "period",
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
      view: "history",
      period: undefined,
      crop: undefined,
      province: undefined,
      district: undefined,
    });
  });
});

describe("reset ignores stored defaults (defaults=none)", () => {
  /** A user who has configured everything a default can hold. */
  const everywhere = mergePreferences(DEFAULT_PREFERENCES, {
    defaultPeriod: "2025B",
    defaultCrop: "Maize",
    defaultProvince: "Kigali City",
    defaultDistrict: "Gasabo",
  });

  it("applies no stored default at all after a reset", () => {
    const context = resolveAnalyticalContext(everywhere, {
      view: SCOPE_HISTORY,
      defaults: DEFAULTS_NONE,
    });
    // Regression: the crop/province/district defaults used to be layered back on
    // after a reset, so "Reset filters" showed a filtered page for anyone who had
    // saved a default.
    expect(context).toEqual({
      view: SCOPE_HISTORY,
      period: undefined,
      crop: undefined,
      province: undefined,
      district: undefined,
    });
  });

  it("still honours a value named in the URL", () => {
    const context = resolveAnalyticalContext(everywhere, {
      view: SCOPE_HISTORY,
      defaults: DEFAULTS_NONE,
      crop: "Beans",
      district: "Huye",
    });
    expect(context.crop).toBe("Beans");
    expect(context.district).toBe("Huye");
    expect(context.period).toBeUndefined();
  });

  it("still resolves an explicit period, because that is a URL selection", () => {
    const context = resolveAnalyticalContext(everywhere, {
      period: "2026A",
      defaults: DEFAULTS_NONE,
    });
    expect(context.period).toBe("2026A");
    expect(context.view).toBe(SCOPE_PERIOD);
    // The defaults are still suppressed around it.
    expect(context.crop).toBeUndefined();
  });

  it("behaves exactly as before when the flag is absent", () => {
    const context = resolveAnalyticalContext(everywhere, { view: SCOPE_HISTORY });
    expect(context.period).toBeUndefined();
    // A plain history link is not a reset: the stored entity defaults still fill in.
    expect(context.crop).toBe("Maize");
    expect(context.province).toBe("Kigali City");
    expect(context.district).toBe("Gasabo");
  });

  it("does not honour an unrecognised defaults value", () => {
    const context = resolveAnalyticalContext(everywhere, {
      view: SCOPE_HISTORY,
      defaults: "nonsense",
    });
    expect(context.crop).toBe("Maize");
  });
});

describe("explicit scope", () => {
  it("defaults to the all-published-periods scope when nothing is configured", () => {
    const context = resolveAnalyticalContext(DEFAULT_PREFERENCES, {});
    expect(context.view).toBe("history");
  });

  it("lets an explicit view=history override a stored default period", () => {
    // Without this, "all published periods" is unreachable for anyone who ever
    // saved a default period in Settings - which is exactly the bug.
    const context = resolveAnalyticalContext(prefs({ defaultPeriod: "2025B" }), {
      view: "history",
    });
    expect(context.view).toBe("history");
    expect(context.period).toBeUndefined();
  });

  it("still applies a stored default period when no explicit view is given", () => {
    const context = resolveAnalyticalContext(prefs({ defaultPeriod: "2025B" }), {});
    expect(context.view).toBe("period");
    expect(context.period).toBe("2025B");
  });

  it("lets a release named by the URL win over view=history", () => {
    // A link that names a release must reproduce what the sender saw.
    const context = resolveAnalyticalContext(prefs({ defaultPeriod: "2025B" }), {
      view: "history",
      period: "2026B",
    });
    expect(context.view).toBe("period");
    expect(context.period).toBe("2026B");
  });

  it("never reports a period scope with no period", () => {
    // A scope that disagrees with the period it sends would make the UI and the
    // API request describe different things.
    const context = resolveAnalyticalContext(prefs({ defaultPeriod: null }), {
      view: "period",
    });
    expect(context.view).toBe("history");
    expect(context.period).toBeUndefined();
  });

  it("does not apply a stored default period on top of an explicit history view", () => {
    const context = resolveAnalyticalContext(
      prefs({ defaultPeriod: "2025B", defaultCrop: "Maize" }),
      { view: "history" },
    );
    // The crop default still applies: only the period dimension is scoped.
    expect(context.crop).toBe("Maize");
    expect(context.period).toBeUndefined();
  });
});

describe("dashboard landing scope (historical default)", () => {
  it("ignores a stored 2025B default period so a bare /dashboard is historical", () => {
    // Regression: a browser could retain
    // `cropmatics-preferences.defaultPeriod = "2025B"`, which made a bare
    // /dashboard open on a single 2025 Season B release instead of the overview.
    const context = resolveAnalyticalContext(prefs({ defaultPeriod: "2025B" }), {}, {
      landing: true,
    });
    expect(context.view).toBe(SCOPE_HISTORY);
    expect(context.period).toBeUndefined();
  });

  it("also ignores stored crop/province/district on the landing scope", () => {
    const context = resolveAnalyticalContext(
      prefs({
        defaultPeriod: "2025B",
        defaultCrop: "Maize",
        defaultProvince: "Kigali City",
        defaultDistrict: "Gasabo",
      }),
      {},
      { landing: true },
    );
    expect(context).toEqual({
      view: SCOPE_HISTORY,
      period: undefined,
      crop: undefined,
      province: undefined,
      district: undefined,
    });
  });

  it("still honours a release named in the URL (a shared link reproduces)", () => {
    const context = resolveAnalyticalContext(
      prefs({ defaultPeriod: "2025B" }),
      { period: "2022A", crop: "Maize" },
      { landing: true },
    );
    expect(context.view).toBe(SCOPE_PERIOD);
    expect(context.period).toBe("2022A");
    expect(context.crop).toBe("Maize");
  });

  it("keeps applying stored defaults on drilldown pages (no landing option)", () => {
    const context = resolveAnalyticalContext(prefs({ defaultPeriod: "2025B" }), {});
    expect(context.period).toBe("2025B");
  });
});

describe("obsolete stored defaults cannot survive the version migration", () => {
  it("discards a version-1 entry that held defaultPeriod=2025B", () => {
    // The version bump is the only way to change stored behaviour in a browser
    // this build cannot read: an old (version 1) entry is dropped, not guessed.
    const legacy = JSON.stringify({
      version: 1,
      defaultPeriod: "2025B",
      defaultCrop: "Maize",
      defaultProvince: null,
      defaultDistrict: null,
      numberGrouping: "grouped",
      compactTables: false,
      reducedMotion: false,
      theme: "system",
      mapLabels: true,
      showSources: true,
    });
    const loaded = loadPreferences(memoryStorage({ [PREFERENCES_KEY]: legacy }));
    expect(loaded.defaultPeriod).toBeNull();
    expect(loaded.defaultCrop).toBeNull();
    expect(loaded).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("version 3 migration (compact provenance by default)", () => {
  it("defaults a new user to compact provenance, not expanded sources", () => {
    expect(DEFAULT_PREFERENCES.showSources).toBe(false);
  });

  it("migrates a v2 entry forward without resetting unrelated preferences", () => {
    const v2 = {
      version: 2,
      defaultPeriod: "2026B",
      defaultCrop: "Maize",
      defaultProvince: "Eastern",
      defaultDistrict: "Bugesera",
      numberGrouping: "plain",
      compactTables: true,
      reducedMotion: true,
      theme: "dark",
      mapLabels: false,
      // The v2 default was `true`, so this may be deliberate.
      showSources: true,
    };
    const out = normalizePreferences(v2);
    expect(out.version).toBe(PREFERENCES_VERSION);
    // Every unrelated preference survives the bump.
    expect(out.defaultPeriod).toBe("2026B");
    expect(out.defaultCrop).toBe("Maize");
    expect(out.defaultProvince).toBe("Eastern");
    expect(out.defaultDistrict).toBe("Bugesera");
    expect(out.numberGrouping).toBe("plain");
    expect(out.compactTables).toBe(true);
    expect(out.reducedMotion).toBe(true);
    expect(out.theme).toBe("dark");
    expect(out.mapLabels).toBe(false);
    // A deliberate "expand sources" choice is preserved, not silently reversed.
    expect(out.showSources).toBe(true);
  });

  it("still discards a v1 entry rather than carrying its landing-scope default", () => {
    expect(normalizePreferences({ version: 1, defaultPeriod: "2025B", showSources: true })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it("treats a corrupt field in a v2 entry as that field's default", () => {
    const out = normalizePreferences({ version: 2, compactTables: "yes" });
    expect(out.compactTables).toBe(DEFAULT_PREFERENCES.compactTables);
    expect(out.showSources).toBe(DEFAULT_PREFERENCES.showSources);
  });
});
