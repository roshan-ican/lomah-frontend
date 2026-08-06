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
    isMiss?: boolean;
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
  const isMiss = inferIsMiss(rawShot.x, rawShot.y, rawShot.isMiss);
  const id = resolveShotNumber(rawShot, fallbackNumber);

  return {
    id,
    targetId: rawShot.targetId,
    score: isMiss
      ? 0
      : (serverScore ?? scoreFromOffset(xVal, yVal, profileType)),
    x: xVal,
    y: yVal,
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
