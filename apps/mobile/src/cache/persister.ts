/**
 * Persisted offline cache for public analytical intelligence.
 *
 * Field-operation data has always been offline-first (SQLite + outbox). The
 * *analytical* screens were not: React Query kept the last response in memory,
 * so closing the app threw it away and a field officer with no signal saw an
 * empty screen until they reached connectivity again. This module makes the
 * read-only analytical result set survive a restart.
 *
 * WHAT IS CACHED
 *   Every query result the React Query client holds, by default. All of them are
 *   public, read-only analytical reads (national board, crop trends, district
 *   performance, gaps, maps, compare, post-harvest, provenance). Nothing here is
 *   user data, and nothing here is written back to the server.
 *
 * WHAT IS NOT CACHED
 *   Mutations and the local outbox/harvest tables stay in SQLite and are
 *   untouched by this module. Clearing this cache can never lose a harvest.
 *
 * HONESTY RULES
 *   - A cache entry is only ever the exact response the API returned. Nothing is
 *     derived, filled or zeroed on restore.
 *   - `updatedAt` is the time the cache was last written, recorded alongside the
 *     payload so the UI can say "cached, updated 3 h ago" instead of implying
 *     the figure is live.
 *   - Absence of a cache entry is reported as "no cached data available"; the
 *     app never falls back to an unrelated latest release.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

/** Where the serialized query cache lives. */
export const CACHE_STORAGE_KEY = "cropmatics.query-cache.v1";
/** Where the cache bookkeeping (last write time) lives. */
export const CACHE_META_KEY = "cropmatics.query-cache.meta.v1";

/**
 * The persisted cache format version.
 *
 * Bumping this discards an old cache on the next launch rather than restoring a
 * payload whose shape no longer matches the types. That is the safe direction:
 * a discarded cache shows "no cached data", a mis-restored one shows wrong data.
 */
export const CACHE_BUSTER = "2026-10-offline-analytics-v1";

/** How long a restored cache is considered usable. Mirrors the client's gcTime. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CacheMeta {
  /** ISO timestamp of the last successful write, or null when never written. */
  updatedAt: string | null;
  /** True once a restore has been attempted this session. */
  restored: boolean;
  /** True when a restore actually hydrated at least one query. */
  hydrated: boolean;
}

const EMPTY_META: CacheMeta = { updatedAt: null, restored: false, hydrated: false };

export async function readCacheMeta(): Promise<CacheMeta> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_META_KEY);
    if (!raw) return EMPTY_META;
    return { ...EMPTY_META, ...(JSON.parse(raw) as Partial<CacheMeta>) };
  } catch {
    return EMPTY_META;
  }
}

export async function writeCacheMeta(patch: Partial<CacheMeta>): Promise<CacheMeta> {
  const next = { ...(await readCacheMeta()), ...patch };
  try {
    await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(next));
  } catch {
    // Losing the bookkeeping must never fail a read; the payload is unaffected.
  }
  return next;
}

/**
 * The React Query persister, in the shape `PersistQueryClientProvider` expects.
 *
 * `persistClient` is wrapped (not replaced) so the last-write timestamp is
 * recorded on the same call that writes the payload: a UI that says "updated at"
 * can therefore never disagree with the payload it is describing.
 */
export function createOfflineCachePersister() {
  const persister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: CACHE_STORAGE_KEY,
    throttleTime: 2000,
  });

  return {
    persistClient: async (client: Parameters<typeof persister.persistClient>[0]) => {
      await persister.persistClient(client);
      await writeCacheMeta({ updatedAt: new Date().toISOString() });
    },
    restoreClient: () => persister.restoreClient(),
    removeClient: async () => {
      await persister.removeClient();
      await writeCacheMeta({ updatedAt: null, hydrated: false });
    },
  };
}

/**
 * Drop every persisted analytical response.
 *
 * Called by Settings -> Clear cached data. Deliberately scoped to the analytical
 * cache: harvest registrations, attachments, ask history and saved items are
 * user data held in SQLite and are never touched here.
 */
export async function clearPersistedCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_STORAGE_KEY);
    await writeCacheMeta({ updatedAt: null, hydrated: false });
  } catch {
    // Storage unavailable: there is nothing to clear.
  }
}