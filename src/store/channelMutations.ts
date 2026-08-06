// Pure channel-updater functions.
//
// A "channel" is one shooting lane's UI state (ActiveShooterChannel). The app
// updates lanes in many places via `setChannels(prev => prev.map(ch => ...))`.
// The transforms that were copy-pasted across those call sites live here as
// pure `(channel, data) => channel` functions so there is ONE definition to
// read, fix, and (later) test. No side effects, no React, no network — just
// "given this lane and this event, what's the new lane object".
//
// Phase 2 will grow this file with one function per realtime event; for now it
// holds the two transforms that were genuinely duplicated in App.tsx.

import type { ActiveShooterChannel, DisplayShot, Lane } from "../types";
import { mergeDisplayShots, zoneFromOffset } from "../utils/shotCoordinates";

/** Local clock label (HH:MM:SS) used when a shot has no server timestamp. */
function clockLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Build a channel from a backend Lane record (as commissioned by the super
 * admin). The store's hardcoded 10-lane default is only a placeholder until
 * the real lanes land from GET /lanes; this maps lane fields onto the
 * channel shape, preserving the lane's id/name so session syncs key off it.
 */
export function channelFromLane(lane: Lane): ActiveShooterChannel {
  return {
    id: `CH-${lane.id}`,
    name: "Vacant Lane",
    opId: "VACANT",
    unit: lane.siteName || "—",
    sessionStatus: "NONE",
    laneStatus: lane.status,
    shots: [],
    distance: "—",
    targetName: "—",
  };
}

/**
 * Reset a lane to the empty "Vacant Lane" state: no session, no shots.
 * Used whenever a session ends, is reviewed, cancelled, or a sync finds the
 * lane idle. Spreads the original channel so lane identity (id/unit/distance)
 * is preserved. Callers that also need to zero totalPausedMs do so explicitly.
 */
export function toVacantLane(ch: ActiveShooterChannel): ActiveShooterChannel {
  return {
    ...ch,
    sessionStatus: "NONE",
    laneStatus: "AVAILABLE",
    name: "Vacant Lane",
    opId: "VACANT",
    shots: [],
    sessionId: undefined,
    startTime: undefined,
    endTime: undefined,
    // A new session resets calibration: pick can be used once again.
    referenceShotId: undefined,
    calibratedShotCount: undefined,
    pickUsed: false,
    // NOT reset: the offset belongs to the board, not the session. It survives
    // the lane going vacant exactly as it survives a restart.
  };
}

/**
 * Merge a batch of recalibrated shots into a lane. Each incoming shot replaces
 * the on-screen shot with the same number (keeping its original timestamp), and
 * the zone is recomputed from the new coordinates. Used by the `lane:calibrated`
 * realtime event and by the admin lane-calibration handler — same logic, one place.
 */
export function applyCalibratedShots(
  ch: ActiveShooterChannel,
  shots: Array<{
    shotNumber: number;
    x: number;
    y: number;
    score: number;
    isMiss: boolean;
  }>,
): ActiveShooterChannel {
  const byId = new Map(ch.shots.map((s) => [s.id, s]));
  const mapped: DisplayShot[] = shots.map((sh) => {
    const existing = byId.get(sh.shotNumber);
    return {
      id: sh.shotNumber,
      score: sh.score,
      x: sh.x,
      y: sh.y,
      zone: zoneFromOffset(sh.x, sh.y, sh.isMiss),
      // Must be carried over explicitly: mergeDisplayShots replaces the whole
      // shot object per id, so omitting isMiss here silently cleared the flag on
      // every calibration and repainted sensor misses as ordinary hits.
      isMiss: sh.isMiss,
      timestamp: existing?.timestamp ?? clockLabel(),
    };
  });
  return { ...ch, shots: mergeDisplayShots(ch.shots, mapped) };
}
