import type { DisplayShot } from "../types";
import {
  SENSOR_CENTRE,
  TARGET_HALF_HEIGHT_MM,
  TARGET_HALF_WIDTH_MM,
  TARGET_HEIGHT_MM,
  TARGET_WIDTH_MM,
  boardMmToSensorCoords,
  boardMmToSensorMm,
  clickToSensorCoords,
  clientToSvgPoint,
  getLaneError,
  inferIsMiss,
  mmToSensorCoords,
  mmToSensorRaw,
  mmToSvgPoint,
  roundMm,
  scoreFromOffset,
  scoreToRingBucket,
  sensorOriginBoardMm,
  sensorRawToMm,
  setLaneError,
  loadLaneErrorsFromRows,
  svgPointToMm,
  zoneFromOffset,
  type TargetProfileType,
} from "@shared/coordinates";

export {
  SENSOR_CENTRE,
  TARGET_HALF_HEIGHT_MM,
  TARGET_HALF_WIDTH_MM,
  TARGET_HEIGHT_MM,
  TARGET_WIDTH_MM,
  boardMmToSensorCoords,
  boardMmToSensorMm,
  clickToSensorCoords,
  clientToSvgPoint,
  getLaneError,
  inferIsMiss,
  mmToSensorCoords,
  mmToSensorRaw,
  mmToSvgPoint,
  scoreFromOffset,
  scoreToRingBucket,
  sensorOriginBoardMm,
  sensorRawToMm,
  setLaneError,
  loadLaneErrorsFromRows,
  svgPointToMm,
  zoneFromOffset,
};

export type { ScoreRingBucket } from "@shared/coordinates";

/** Stable 1-based shot label from server payload (never use array index). */
export function resolveShotNumber(
  shot: {
    shotNumber?: number;
    bulletCount?: number;
    status?: number;
  },
  fallback?: number,
): number {
  if (typeof shot.shotNumber === "number" && shot.shotNumber > 0) {
    return shot.shotNumber;
  }
  if (typeof shot.bulletCount === "number" && shot.bulletCount > 0) {
    return shot.bulletCount;
  }
  if (typeof shot.status === "number" && shot.status > 0) {
    return shot.status;
  }
  if (typeof fallback === "number" && fallback > 0) {
    return fallback;
  }
  return 0;
}

export function sortShotsNewestFirst(shots: DisplayShot[]): DisplayShot[] {
  return [...shots].sort((a, b) => b.id - a.id);
}

/**
 * Would replacing `existing` with `incoming` lose information?
 *
 * The same shot number is announced more than once on purpose: the server holds
 * a no-detection shot, asks the board to re-read it, and re-announces the row
 * with a real position when the board answers. That direction — miss or lost
 * becoming a located hit — must always be allowed through.
 *
 * The other direction must not be. A late LOST placeholder, a replayed event
 * after a reconnect, or an out-of-order delivery would otherwise erase a bullet
 * hole the shooter is already looking at and put a miss in its place. Position
 * is the tiebreak because it is the thing that cannot be invented: a row with
 * coordinates was located by the board, a row without one never was.
 */
export function isDowngrade(
  existing: DisplayShot,
  incoming: DisplayShot,
): boolean {
  const existingLocated = !existing.isMiss && !existing.isLost;
  const incomingLocated = !incoming.isMiss && !incoming.isLost;
  return existingLocated && !incomingLocated;
}

export function mergeDisplayShots(
  existing: DisplayShot[],
  incoming: DisplayShot[],
): DisplayShot[] {
  const byId = new Map<number, DisplayShot>();
  for (const shot of existing) {
    if (shot.id > 0) byId.set(shot.id, shot);
  }
  for (const shot of incoming) {
    if (shot.id > 0) byId.set(shot.id, shot);
  }
  return sortShotsNewestFirst(Array.from(byId.values()));
}


export function buildCalibrationMarker(
  shotCount: number,
  calibratedAt?: string,
): DisplayShot {
  const at = calibratedAt ? new Date(calibratedAt) : new Date();
  return {
    id: shotCount + 0.5,
    score: 0,
    x: 0,
    y: 0,
    zone: "Off-Target",
    timestamp: at.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    isMiss: false,
    isCalibrationMarker: true,
  };
}

export function mapRawShotToDisplay(
  rawShot: {
    shotNumber?: number;
    bulletCount?: number;
    status?: number;
    x: number;
    y: number;
    /** Pre-calibration board-mm, when the payload carries it. Passed through
     *  untouched and never derived: subtracting the target's current offset
     *  from x would be wrong for any shot that has since been dragged
     *  individually, which is exactly the shot worth inspecting. */
    sensorXmm?: number;
    sensorYmm?: number;
    isMiss?: boolean;
    isLost?: boolean;
    timestamp?: string | Date;
    targetId?: string;
  },
  fallbackNumber?: number,
  _laneId = 1,
  profileType: TargetProfileType = "FIGURE",

  serverScore?: number,
): DisplayShot {

  const xVal = Number.isFinite(rawShot.x) ? rawShot.x : 0;
  const yVal = Number.isFinite(rawShot.y) ? rawShot.y : 0;
  // A lost bullet is a miss by definition — the server writes it that way, but
  // an older payload that predates isLost will not, so it is forced here rather
  // than trusted from the wire.
  const isLost = rawShot.isLost === true;
  const isMiss = isLost || inferIsMiss(rawShot.x, rawShot.y, rawShot.isMiss);
  const id = resolveShotNumber(rawShot, fallbackNumber);

  return {
    id,
    targetId: rawShot.targetId,
    isLost,
    score: isMiss
      ? 0
      : (serverScore ?? scoreFromOffset(xVal, yVal, profileType)),
    x: xVal,
    y: yVal,
    // Dropped on a miss along with x/y: a sentinel frame located nothing, so
    // there is no sensor reading to preserve either.
    sensorX: isMiss ? undefined : rawShot.sensorXmm,
    sensorY: isMiss ? undefined : rawShot.sensorYmm,
    zone: zoneFromOffset(xVal, yVal, isMiss, profileType),
    isMiss,
    timestamp: new Date(rawShot.timestamp ?? Date.now()).toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      },
    ),
  };
}
