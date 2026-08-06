// IndexedDB-backed shot cache (cache-first / offline-first bullet store).
//
// Survives browser restarts and tab crashes so the admin board / shooter
// tablet can paint the last known shots instantly on load, before the
// WebSocket re-connects and the backend HTTP sync resolves. The realtime
// hook (useRealtimeChannels) hydrates from this cache on mount and
// write-throughs every shot / calibration event; terminal session events
// (reviewed / cancelled / discarded / saved) clear the cache so a new
// session on the same lane doesn't inherit stale bullets.
//
// Keyed per (sessionId, laneId) so those never bleed across sessions.
// All writes are fire-and-forget — IndexedDB is async and must never
// block the UI or the WebSocket handler.

import { openDB, type IDBPDatabase } from "idb";
import type { DisplayShot } from "../types";

const DB_NAME = "lomah-shot-cache";
const DB_VERSION = 1;
const STORE = "shots";

interface CachedSession {
  id: string; // `${sessionId}:${laneId}`
  sessionId: string;
  laneId: number;
  shots: DisplayShot[];
  updatedAt: string;
}

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

function key(sessionId: string, laneId: number): string {
  return `${sessionId}:${laneId}`;
}

/** Read cached shots for a specific session + lane (null if none). */
export async function getCachedShots(
  sessionId: string,
  laneId: number,
): Promise<DisplayShot[] | null> {
  try {
    const db = await getDb();
    const rec = (await db.get(STORE, key(sessionId, laneId))) as
      | CachedSession
      | undefined;
    if (!rec?.shots) return null;
    // Drop calibration dividers that sort before shot #1. These could only come
    // from a build that inserted a marker for a zero-shot calibration (id 0.5),
    // and once cached they reappeared on every reload as "Calibration Applied"
    // on a lane with no shots. Real markers are always id > 1.
    return rec.shots.filter((s) => !(s.isCalibrationMarker && s.id < 1));
  } catch (err) {
    console.warn("[shotCache] getCachedShots failed:", err);
    return null;
  }
}

/** Write shots for a session + lane (fire-and-forget safe to call). */
export async function setCachedShots(
  sessionId: string,
  laneId: number,
  shots: DisplayShot[],
): Promise<void> {
  if (!sessionId) return;
  try {
    const db = await getDb();
    const rec: CachedSession = {
      id: key(sessionId, laneId),
      sessionId,
      laneId,
      shots,
      updatedAt: new Date().toISOString(),
    };
    await db.put(STORE, rec);
  } catch (err) {
    console.warn("[shotCache] setCachedShots failed:", err);
  }
}

/** Clear cache for one session + lane (used on terminal events). */
export async function clearCachedShots(
  sessionId: string,
  laneId: number,
): Promise<void> {
  if (!sessionId) return;
  try {
    const db = await getDb();
    await db.delete(STORE, key(sessionId, laneId));
  } catch (err) {
    console.warn("[shotCache] clearCachedShots failed:", err);
  }
}

/**
 * Clear every cached record for a lane regardless of session.
 * Used when a new session is created on the lane so the previous
 * session's bullets don't leak into the new one.
 */
export async function clearCachedShotsForLane(
  laneId: number,
): Promise<void> {
  try {
    const db = await getDb();
    const all = (await db.getAll(STORE)) as CachedSession[];
    await Promise.all(
      all
        .filter((rec) => rec.laneId === laneId)
        .map((rec) => db.delete(STORE, rec.id)),
    );
  } catch (err) {
    console.warn("[shotCache] clearCachedShotsForLane failed:", err);
  }
}

/** Wipe the entire cache (debug / reset). */
export async function clearAllCachedShots(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(STORE);
  } catch (err) {
    console.warn("[shotCache] clearAllCachedShots failed:", err);
  }
}