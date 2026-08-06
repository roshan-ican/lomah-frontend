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
const DB_VERSION = 1;
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
      upgrade(db) {
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

/** Write-through every channel's non-shot fields (fire-and-forget safe to call). */
export async function setCachedChannels(
  channels: ActiveShooterChannel[],
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE, "readwrite");
    const cachedAt = new Date().toISOString();
    await Promise.all([
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
