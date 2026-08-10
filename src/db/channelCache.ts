// IndexedDB-backed channel cache (metadata-only read-repaint cache).
//
// Survives app/browser restarts so the admin board / shooter tablet can
// paint the last known lane state (status, shooter, timers, calibration —
// everything except shots, which stay in shotCache.ts) instantly on load,
// before the backend HTTP resync lands. sessionStore.ts write-throughs to
// this on every state change via a subscribe(), and useRealtimeChannels
// reads it once at mount, before syncActiveSessions() — server data always
// wins once it arrives; this only fills the gap until then.
//
// Not session-scoped like shotCache.ts: one record per lane, unconditionally
// overwritten on every store change, so a new session's data naturally
// supersedes the old one — no explicit clear-on-terminal-event needed.

import { openDB, type IDBPDatabase } from "idb";
import type { ActiveShooterChannel } from "../types";

const DB_NAME = "lomah-channel-cache";
/**
 * v2 drops everything written by v1.
 *
 * v1 caches were written while sessionStore still seeded ten invented
 * placeholder lanes ("Shooter 3", "ALPHA SQUADRON", "500m"). Removing that seed
 * stopped NEW installs painting them, but did nothing for the ten rows already
 * sitting in every existing client's IndexedDB — hydrateChannelsFromCache reads
 * them on cold start and paints all ten before GET /lanes lands, which is the
 * fake lanes still showing up on load. Nothing in a v1 cache is worth keeping,
 * so the upgrade discards the store wholesale rather than trying to tell an
 * invented lane from a real one.
 */
const DB_VERSION = 2;
const STORE = "channels";

export type CachedChannel = Omit<ActiveShooterChannel, "shots"> & {
  cachedAt: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable (non-browser)"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // See DB_VERSION — a v1 store holds invented lanes, so it goes.
        if (oldVersion < 2 && db.objectStoreNames.contains(STORE)) {
          db.deleteObjectStore(STORE);
        }
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Read every cached lane record (empty array if none / on failure). */
export async function getCachedChannels(): Promise<CachedChannel[]> {
  try {
    const db = await getDb();
    return (await db.getAll(STORE)) as CachedChannel[];
  } catch (err) {
    console.warn("[channelCache] getCachedChannels failed:", err);
    return [];
  }
}

/**
 * Write-through every channel's non-shot fields (fire-and-forget safe to call).
 *
 * The list is treated as the WHOLE truth: rows whose lane is absent from it are
 * deleted in the same transaction. Without that this only ever put(), so a lane
 * that was decommissioned — or was never real to begin with — stayed in the
 * cache forever and got repainted on every cold start, because syncLanesFromApi
 * drops it from the store but nothing ever dropped it from IndexedDB.
 *
 * Guarded on a non-empty list: the store starts empty and is briefly empty
 * during a reset, and letting that wipe the cache would defeat the point of
 * having one — the next launch would have nothing to paint.
 */
export async function setCachedChannels(
  channels: ActiveShooterChannel[],
): Promise<void> {
  if (!channels.length) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE, "readwrite");
    const cachedAt = new Date().toISOString();
    const live = new Set(channels.map((ch) => ch.id));
    const stale = ((await tx.store.getAllKeys()) as string[]).filter(
      (id) => !live.has(id),
    );
    await Promise.all([
      ...stale.map((id) => tx.store.delete(id)),
      ...channels.map(({ shots: _shots, ...rest }) =>
        tx.store.put({ ...rest, cachedAt } as CachedChannel),
      ),
      tx.done,
    ]);
  } catch (err) {
    console.warn("[channelCache] setCachedChannels failed:", err);
  }
}

/** Wipe the entire cache (debug / reset). */
export async function clearAllCachedChannels(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(STORE);
  } catch (err) {
    console.warn("[channelCache] clearAllCachedChannels failed:", err);
  }
}
