/**
 * Offline analytics cache orchestration.
 *
 * `persister.ts` owns the storage format and the honesty rules; this module is
 * the piece that was missing — it actually connects that storage to the React
 * Query client the app runs on. Without it the cache was written to disk by
 * nobody and read by nobody, so an offline launch showed empty analytical
 * screens even though the last response was still on the device.
 *
 * WHAT IT DOES
 *   - On launch, restores the persisted analytical responses and hydrates them
 *     into the client, but only when the format buster matches and the payload is
 *     within its usable age. A mismatched or expired payload is dropped, not
 *     partially applied.
 *   - While enabled, persists the client after analytical reads settle. Writes
 *     are debounced so a burst of parallel reads produces one write.
 *   - On disable, stops writing and removes the payload already on disk so a
 *     later re-enable starts clean rather than resurrecting stale figures.
 *
 * WHAT IT NEVER DOES
 *   - It never fabricates a value. A restore is the exact response the API
 *     returned, or nothing at all.
 *   - It never touches mutations or the field-operations SQLite/outbox store.
 *     Only successful queries are dehydrated, so a failed request is not cached
 *     as if it were a result.
 */

import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";

import {
  CACHE_BUSTER,
  CACHE_MAX_AGE_MS,
  createOfflineCachePersister,
  type CacheMeta,
} from "./persister";

/** One persister instance: a second one would open its own write throttle. */
const persister = createOfflineCachePersister();

/** How long to wait after a cache change before serialising. */
const PERSIST_DEBOUNCE_MS = 2000;

/**
 * Restore any usable payload into the client.
 *
 * Returns the resulting bookkeeping so the caller can report whether anything
 * was actually hydrated. A payload older than `CACHE_MAX_AGE_MS`, or written by
 * a different format version, is removed rather than restored.
 */
export async function hydrateOfflineCache(queryClient: QueryClient): Promise<CacheMeta> {
  const restored = await persister.restoreClient();
  if (!restored) {
    return { updatedAt: null, restored: true, hydrated: false };
  }

  const expired = Date.now() - restored.timestamp > CACHE_MAX_AGE_MS;
  const wrongVersion = restored.buster !== CACHE_BUSTER;
  if (expired || wrongVersion || !restored.clientState) {
    await persister.removeClient();
    return { updatedAt: null, restored: true, hydrated: false };
  }

  hydrate(queryClient, restored.clientState);
  const hydrated = restored.clientState.queries.length > 0;
  return {
    updatedAt: new Date(restored.timestamp).toISOString(),
    restored: true,
    hydrated,
  };
}

/**
 * Build a persistable snapshot of the client.
 *
 * Only successful queries are dehydrated: a pending request or an error state is
 * not a result, and caching it offline would present a failure as data.
 */
function snapshot(queryClient: QueryClient) {
  return {
    timestamp: Date.now(),
    buster: CACHE_BUSTER,
    clientState: dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => query.state.status === "success",
    }),
  };
}

/**
 * Start persisting the client.
 *
 * Returns an unsubscribe function. The debounce collapses the burst of cache
 * events a screen produces on load into a single write.
 */
export function startPersisting(queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    void persister.persistClient(snapshot(queryClient));
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // Only successful results and removals are worth writing. An "observer"
    // event just describes subscription, not data.
    if (event.type !== "updated" && event.type !== "removed" && event.type !== "added") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

/** Remove the persisted payload and empty the in-memory analytical cache. */
export async function clearOfflineCache(queryClient: QueryClient): Promise<void> {
  await persister.removeClient();
  queryClient.clear();
}
