/**
 * Local user preferences.
 *
 * Deliberately pure and storage-agnostic so the parsing and merging rules are
 * testable in a plain node environment, and so a corrupt or outdated entry in a
 * user's browser can never break the application: an unreadable preference falls
 * back to its default rather than throwing.
 *
 * Every preference here is wired to real behaviour. A control that only
 * persisted a value would be the same failure as the "coming soon" page this
 * module replaced — a setting that appears to do something and does not.
 */

import { DEFAULTS_NONE, SCOPE_HISTORY, SCOPE_PERIOD, type ScopeView } from "./filters";

export const PREFERENCES_KEY = "cropmatics-preferences";
/**
 * Version 2: the dashboard landing-scope repair.
 *
 * Version 1 could hold ``defaultPeriod = "2025B"``, which made a bare
 * ``/dashboard`` open on a single 2025 Season B release instead of the historical
 * overview. Version 1 entries are therefore still **discarded**, never migrated:
 * that obsolete default must not be carried forward.
 *
 * Version 3: compact provenance by default.
 *
 * ``showSources`` used to default to ``true``, so every new reader met every
 * source panel already expanded. It now defaults to ``false`` (compact, with a
 * reachable ``Sources``/``Details`` control). Existing entries are **migrated**
 * rather than reset: a v2 user who deliberately expanded sources keeps that
 * choice, and unrelated theme/filter preferences are preserved. Only the default
 * a *new* user gets changes.
 */
export const PREFERENCES_VERSION = 3;

export type NumberGrouping = "grouped" | "plain";
export type ThemePreference = "system" | "light" | "dark";

export interface Preferences {
  /** Bumped when the shape changes, so an old entry is discarded, not guessed. */
  version: number;
  /** Analytical context applied when a page URL carries no explicit selection. */
  defaultPeriod: string | null;
  defaultCrop: string | null;
  defaultProvince: string | null;
  defaultDistrict: string | null;
  /** Thousands separators in tabular and KPI numbers ("1,234" vs "1234"). */
  numberGrouping: NumberGrouping;
  /** Denser table rows, for fitting more of a ranking on one screen. */
  compactTables: boolean;
  /**
   * Disables interface transitions and chart entry animations.
   *
   * One control rather than separate "reduced motion" and "chart animation"
   * toggles: they express the same intent, and two switches where one is a
   * subset of the other is a worse interface than one that plainly does both.
   * The OS-level `prefers-reduced-motion` setting also turns this on, so a user
   * who has already asked the platform for less motion is not asked again.
   */
  reducedMotion: boolean;
  /**
   * Colour scheme. `system` follows the operating system and updates live when
   * the OS preference changes; the explicit values override it.
   */
  theme: ThemePreference;
  /** District names drawn on the choropleth. */
  mapLabels: boolean;
  /**
   * Whether source notes and provenance panels are expanded by default.
   *
   * ``false`` is the compact default: provenance is still present (a short
   * source label, the period, and a reachable ``Sources`` control) - it is just
   * not expanded on arrival. This is not a way to hide accountability.
   */
  showSources: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  version: PREFERENCES_VERSION,
  defaultPeriod: null,
  defaultCrop: null,
  defaultProvince: null,
  defaultDistrict: null,
  numberGrouping: "grouped",
  compactTables: false,
  reducedMotion: false,
  theme: "system",
  mapLabels: true,
  showSources: false,
};

/** Only the keys this build knows about, so storage cannot inject new fields. */
const KNOWN_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[];

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Coerce an arbitrary parsed value into Preferences.
 *
 * Field by field rather than `Object.assign`: a value of the wrong type from an
 * older build (or a hand-edited entry) must keep its default instead of reaching
 * the UI as `undefined`.
 */
/**
 * Carry a supported older entry forward, or return null when it must be discarded.
 *
 * v1 -> discarded. It could hold the ``defaultPeriod`` that broke the dashboard
 * landing scope; that reason still stands.
 * v2 -> migrated field by field, including ``showSources``. A deliberate choice
 * to expand sources survives; only the default for a new user changes.
 * Anything else (unknown, or written by a newer build) -> discarded rather than
 * guessed at, which is the only safe option for a shape this build does not know.
 */
function migrate(raw: Record<string, unknown>, version: number | null): Record<string, unknown> | null {
  if (version === null || version === 1) return null;
  if (version === PREFERENCES_VERSION) return raw;
  if (version === 2) return { ...raw, version: PREFERENCES_VERSION };
  return null;
}

export function normalizePreferences(input: unknown): Preferences {
  if (typeof input !== "object" || input === null) return { ...DEFAULT_PREFERENCES };
  const rawInput = input as Record<string, unknown>;
  const version = typeof rawInput.version === "number" ? rawInput.version : null;
  const raw = migrate(rawInput, version);
  if (!raw) return { ...DEFAULT_PREFERENCES };

  return {
    version: PREFERENCES_VERSION,
    defaultPeriod: asNullableString(raw.defaultPeriod),
    defaultCrop: asNullableString(raw.defaultCrop),
    defaultProvince: asNullableString(raw.defaultProvince),
    defaultDistrict: asNullableString(raw.defaultDistrict),
    numberGrouping: raw.numberGrouping === "plain" ? "plain" : "grouped",
    compactTables: asBoolean(raw.compactTables, DEFAULT_PREFERENCES.compactTables),
    reducedMotion: asBoolean(raw.reducedMotion, DEFAULT_PREFERENCES.reducedMotion),
    theme:
      raw.theme === "light" || raw.theme === "dark" ? raw.theme : "system",
    mapLabels: asBoolean(raw.mapLabels, DEFAULT_PREFERENCES.mapLabels),
    showSources: asBoolean(raw.showSources, DEFAULT_PREFERENCES.showSources),
  };
}

/** The subset of the Storage API this module needs (keeps it testable). */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read persisted preferences, tolerating absent, corrupt or stale entries. */
export function loadPreferences(storage: PreferenceStorage | null | undefined): Preferences {
  if (!storage) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = storage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    // Unparseable JSON is treated as "no preferences", never as a crash.
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  storage: PreferenceStorage | null | undefined,
  preferences: Preferences,
): void {
  if (!storage) return;
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Private-browsing quota errors must not break the page.
  }
}

/** Apply a patch, keeping unknown keys out and re-normalising the result. */
export function mergePreferences(
  current: Preferences,
  patch: Partial<Preferences>,
): Preferences {
  const next: Record<string, unknown> = { ...current };
  for (const key of KNOWN_KEYS) {
    if (key in patch) next[key] = patch[key];
  }
  next.version = PREFERENCES_VERSION;
  return normalizePreferences(next);
}

export function resetPreferences(): Preferences {
  return { ...DEFAULT_PREFERENCES };
}

/**
 * The analytical context a page should start from, and the scope it resolves to.
 *
 * Three rules, all about not letting a default quietly change what is on screen:
 *
 * 1. An explicit URL selection always wins. That is what makes a shared link
 *    reproduce what the sender saw rather than what the recipient configured.
 * 2. An explicit `view=history` beats a stored default period. This is the whole
 *    point of an explicit all-periods state: without it, anyone who ever saved a
 *    default period can never ask for all published periods again.
 * 3. A default **district** is applied only when the effective province is the
 *    default province. Otherwise a link that names one province would come back
 *    carrying a district from another, which is not a valid selection at all.
 * 4. `defaults=none` suppresses **every** stored default for this view. That is
 *    what makes "Reset filters" mean one thing for everybody: clearing the URL
 *    alone is not enough, because the stored crop/province/district would be
 *    layered straight back on and the page would come back filtered for some
 *    users and unfiltered for others. A value named *in the URL* still wins -
 *    only the fallbacks are suppressed.
 *
 * A legacy `year`+`season` link already names a period, so it is treated as an
 * explicit period and the stored default period is not layered on top of it.
 *
 * `view` is derived from the period that actually survived, so the scope a
 * caller renders can never disagree with the period it sends to the API.
 */
export function resolveAnalyticalContext(
  preferences: Preferences,
  urlFilters: {
    period?: string;
    view?: ScopeView;
    year?: number;
    season?: string;
    crop?: string;
    province?: string;
    district?: string;
    defaults?: string;
  },
  options?: {
    /**
     * The national dashboard landing scope. Stored defaults are suppressed so a
     * bare ``/dashboard`` always opens on the historical, all-crops, all-districts
     * overview; an explicit URL selection still wins, so a shared release link
     * reproduces faithfully.
     */
    landing?: boolean;
  },
): { view: ScopeView; period?: string; crop?: string; province?: string; district?: string } {
  // Rule 4: an explicit "ignore my defaults" view falls back to nothing, and the
  // dashboard landing suppresses them for the same reason "Reset filters" does:
  // a stored 2025B default period must not become the landing scope.
  const stored =
    urlFilters.defaults === DEFAULTS_NONE || options?.landing ? null : preferences;

  const explicitPeriod =
    urlFilters.period ||
    (urlFilters.year && urlFilters.season
      ? `${urlFilters.year}${urlFilters.season}`
      : undefined);

  // A stored default period only applies when the URL has not explicitly asked
  // for all published periods (or for no stored defaults at all).
  const fallbackPeriod = stored?.defaultPeriod || undefined;
  const wantsPeriod =
    Boolean(explicitPeriod) ||
    (urlFilters.view !== SCOPE_HISTORY && Boolean(fallbackPeriod));
  const period = explicitPeriod || (wantsPeriod ? fallbackPeriod : undefined);
  const view: ScopeView = period ? SCOPE_PERIOD : SCOPE_HISTORY;

  const province = urlFilters.province || stored?.defaultProvince || undefined;
  const districtFromUrl = urlFilters.district;
  const districtFromDefault =
    stored?.defaultDistrict && province === (stored.defaultProvince ?? undefined)
      ? stored.defaultDistrict
      : undefined;

  return {
    view,
    period,
    crop: urlFilters.crop || stored?.defaultCrop || undefined,
    province,
    district: districtFromUrl || districtFromDefault,
  };
}
