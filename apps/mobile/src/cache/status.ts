/**
 * Cache freshness vocabulary.
 *
 * Pure and synchronous so the wording the UI shows for "how old is this cached
 * figure" is unit-testable, and so a screen cannot invent its own phrasing for
 * the same state.
 */

export type CacheFreshness = "none" | "fresh" | "aging" | "stale";

/** Under this age a cached payload is described as current. */
export const FRESH_MS = 6 * 60 * 60 * 1000;
/** Beyond this age it is described as stale, while still shown. */
export const AGING_MS = 24 * 60 * 60 * 1000;

export interface CacheDescription {
  freshness: CacheFreshness;
  /** Age of the cache in ms, or null when there is no usable timestamp. */
  ageMs: number | null;
  /** A human age ("3 h ago"), or null when there is nothing to date. */
  ageLabel: string | null;
}

export function formatAge(ageMs: number): string {
  const minutes = Math.max(0, Math.round(ageMs / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/**
 * Describe a cache timestamp.
 *
 * A missing or unparseable timestamp is `none` — the app says "no cached data",
 * which is true, rather than implying a figure is present and current.
 */
export function describeCache(updatedAt: string | null, now: number = Date.now()): CacheDescription {
  if (!updatedAt) return { freshness: "none", ageMs: null, ageLabel: null };
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) return { freshness: "none", ageMs: null, ageLabel: null };
  const ageMs = Math.max(0, now - parsed);
  const freshness: CacheFreshness =
    ageMs <= FRESH_MS ? "fresh" : ageMs <= AGING_MS ? "aging" : "stale";
  return { freshness, ageMs, ageLabel: formatAge(ageMs) };
}