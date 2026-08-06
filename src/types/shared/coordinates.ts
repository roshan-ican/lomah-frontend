export function scoreFromOffset(xMm: number, yMm: number, profileType: TargetProfileType = "FIGURE"): number {
  return scoreFromOffsetJS(xMm, yMm, profileType);
}
// Target dimensions: Figure 11 target is 45cm wide × 100cm tall.
export const TARGET_WIDTH_MM = 450;
export const TARGET_HEIGHT_MM = 1000;
export const TARGET_HALF_WIDTH_MM = TARGET_WIDTH_MM / 2;
export const TARGET_HALF_HEIGHT_MM = TARGET_HEIGHT_MM / 2;

export const SENSOR_CENTRE = 32767;
export const SENSOR_RANGE = 65535;
export const SENSOR_MAX_OFFSET = SENSOR_CENTRE;
export const SENSOR_Y_MAX = 1000;

/** SVG viewBox is 400×400. */
export const SVG_VIEW_SIZE = 400;
export const SVG_CENTER_X = 200;
/** Outer bullseye ring radius — the circular board's 450mm edge at MM_TO_SVG. */
export const SVG_BOARD_RADIUS = 180;
/** 1mm = 0.4 SVG units, anchored to board height so shots plot on the 450×1000mm board. */
export const MM_TO_SVG = SVG_VIEW_SIZE / TARGET_HEIGHT_MM;

export const TARGET_DISPLAY_PX = 340;

export type BoardAxis = "x" | "y";

export const F11_CENTER_HALF_W = 22.5;
export const F11_CENTER_HALF_H = 61.5;
export const F11_CENTER_Y = 0;
export const F11_MIDDLE_Y = 0;
export const F11_OUTER_Y = 0;

export const F11_MIDDLE_HALF_W = 46.5;
export const F11_MIDDLE_HALF_H = 90.5;

export const F11_OUTER_HALF_W = 82.5;
export const F11_OUTER_HALF_H = 181;


export const F11_SILHOUETTE_HALF_W = 225;
export const F11_SILHOUETTE_HALF_H = 500;

export interface SensorBoardOffset {
  x: number;
  y: number;
}

const laneErrors = new Map<number, SensorBoardOffset>();

export function getLaneError(laneId: number): SensorBoardOffset {
  return laneErrors.get(laneId) ?? { x: 0, y: 0 };
}

export function setLaneError(laneId: number, x: number, y: number): void {
  laneErrors.set(laneId, { x: roundMm(x), y: roundMm(y) });
}

export function loadLaneErrorsFromRows(
  rows: { laneId: number; offsetX: number; offsetY: number }[],
): void {
  laneErrors.clear();
  for (const row of rows) {
    setLaneError(row.laneId, row.offsetX, row.offsetY);
  }
}

/** @deprecated Use getLaneError(laneId) */
export function getSensorBoardOffset(laneId = 1): SensorBoardOffset {
  return getLaneError(laneId);
}

/** @deprecated Use setLaneError(laneId, x, y) */
export function setSensorBoardOffset(x: number, y: number, laneId = 1): void {
  setLaneError(laneId, x, y);
}

/** Round to whole millimetres. INTEGER INVARIANT — sensor path is integer end to end. Only call where genuine floats enter: pointer coords (getBoundingClientRect), DB/HTTP values, or serialising to packet bytes (mmToSensorRaw). */
export function roundMm(mm: number): number {
  return Math.round(mm);
}

/** Raw protocol value → native sensor mm. Wire format is signed 16-bit mm count; Y carries +500mm sensor bias. Exact inverse of mmToSensorRaw. Integer in, integer out. */
export function sensorRawToSensorMm(raw: number, axis: BoardAxis): number {
  const signed = raw > SENSOR_CENTRE ? raw - (SENSOR_RANGE + 1) : raw;
  return axis === "x" ? -signed : signed - SENSOR_Y_MAX / 2;
}

/** @deprecated Use sensorRawToSensorMm */
export function sensorRawToMm(raw: number, axis: BoardAxis): number {
  return sensorRawToSensorMm(raw, axis);
}

/** Native sensor mm → mm relative to board visual centre. Integer in, integer out — see roundMm invariant. */
export function sensorMmToBoardMm(
  nativeMm: number,
  axis: BoardAxis,
  laneId: number,
): number {
  const error = getLaneError(laneId);
  const axisError = axis === "x" ? error.x : error.y;
  return nativeMm - axisError;
}


/** Board-centre mm → native sensor mm (inverse of sensorMmToBoardMm). Formula: x(received) = x + x(error). No rounding — both operands are whole mm. */
export function boardMmToSensorMm(
  boardMm: number,
  axis: BoardAxis,
  laneId: number,
): number {
  const error = getLaneError(laneId);
  const axisError = axis === "x" ? error.x : error.y;
  return boardMm + axisError;
}

/** Returns true when the sensor reports it could not triangulate the shot.
 *  LOMAH uses (0,0) or (65535,65535) as "no detection" sentinels. */
export function isSensorMiss(rawX: number, rawY: number): boolean {
  return (rawX === 0 && rawY === 0)
}

/** Infer miss from explicit flag or sensor sentinel values.
 *  Always checks (0,0) and (65535,65535) regardless of value range. */
export function inferIsMiss(x: number, y: number, isMiss?: boolean): boolean {
  if (typeof isMiss === "boolean") return isMiss;
  return isSensorMiss(x, y);
}

/** Raw sensor or already-converted board mm → board-centre mm for display/scoring. */

/** Native sensor mm → raw protocol value (signed 16-bit mm, two's complement). Inverse of UDP decode in lomah-sensor-command.ts — simulated clicks and real hits produce identical packets. */
export function mmToSensorRaw(nativeMm: number, axis: BoardAxis): number {
  // Must mirror X and re-bias Y to stay the exact inverse of
  // sensorRawToSensorMm — otherwise click-to-place lands mirrored.
  const biased = axis === "x" ? -nativeMm : nativeMm + SENSOR_Y_MAX / 2;
  const signed = Math.round(
    Math.max(-SENSOR_CENTRE - 1, Math.min(SENSOR_CENTRE, biased)),
  );
  return signed < 0 ? signed + SENSOR_RANGE + 1 : signed;
}

/** Board-centre mm → raw sensor value for storage / protocol. */
export function boardMmToSensorRaw(
  boardMm: number,
  axis: BoardAxis,
  laneId: number,
): number {
  return mmToSensorRaw(boardMmToSensorMm(boardMm, axis, laneId), axis);
}

export function boardMmToSensorCoords(
  xBoard: number,
  yBoard: number,
  laneId: number,
): { x: number; y: number } {
  return {
    x: boardMmToSensorRaw(xBoard, "x", laneId),
    y: boardMmToSensorRaw(yBoard, "y", laneId),
  };
}

/** @deprecated Use boardMmToSensorCoords — assumes board-relative mm */
export function mmToSensorCoords(
  xMm: number,
  yMm: number,
  laneId: number,
): { x: number; y: number } {
  return boardMmToSensorCoords(xMm, yMm, laneId);
}

export function figureCenterY(): number {
  return 172;
}
/** Visual centre for profile-specific rings/grid (chest on figure, geometric on circular). */
export function boardCenterY(profileType: "FIGURE" | "CIRCULAR"): number {
  return profileType === "FIGURE" ? figureCenterY() : SVG_CENTER_X;
}

/** Board-centre origin for shot placement — always geometric centre so hits align across profiles. */
export function boardOriginY(): number {
  return SVG_CENTER_X;
}

/** Board-centre mm where sensor native origin (0,0) appears on the target. Lane error is already whole mm (setLaneError rounds on the way in), so negating needs no second round. */
export function sensorOriginBoardMm(laneId: number): SensorBoardOffset {
  const error = getLaneError(laneId);
  return { x: -error.x, y: -error.y };
}
export function mmToSvgPoint(
  xMm: number,
  yMm: number,
  _profileType?: "FIGURE" | "CIRCULAR",
): { x: number; y: number } {
  const centerY = boardOriginY();
  return {
    x: SVG_CENTER_X + xMm * MM_TO_SVG,
    y: centerY - yMm * MM_TO_SVG,
  };
}

export function svgPointToMm(
  svgX: number,
  svgY: number,
  _profileType?: "FIGURE" | "CIRCULAR",
): { xMm: number; yMm: number } {
  const centerY = boardOriginY();
  return {
    xMm: roundMm((svgX - SVG_CENTER_X) / MM_TO_SVG),
    yMm: roundMm((centerY - svgY) / MM_TO_SVG),
  };
}

type RectLike = { left: number; top: number; width: number; height: number };

export function clientToSvgPoint(
  clientX: number,
  clientY: number,
  svgRect: RectLike,
): { x: number; y: number } {
  return {
    x: ((clientX - svgRect.left) / svgRect.width) * SVG_VIEW_SIZE,
    y: ((clientY - svgRect.top) / svgRect.height) * SVG_VIEW_SIZE,
  };
}

/** Scoring ring radii, measured from the *scoring origin* (see scoringOffset below). */
export const ZONE_HEAD_MM = 50;
export const ZONE_CHEST_MM = 125;
export const ZONE_SHOULDER_MM = 200;
/** Outer silhouette / torso ring — matches the 110px scoring ring on the figure. */
export const ZONE_BODY_MM = 275;
/** Full figure silhouette extent from the chest-centre origin. */
export const ZONE_FIGURE_MAX_MM = 320;

export function scoreFromOffsetJS(
  xMm: number,
  yMm: number,
  profileType: TargetProfileType = "FIGURE",
): number {
  if (profileType === "CIRCULAR") {
    const r = Math.sqrt(xMm * xMm + yMm * yMm);
    if (r > 450) return 0;
    return Math.max(1, Math.ceil(10 - r / 45));
  }

  // Figure 11 rectangular scoring — each box has its own center (from reference image)
  const ax = Math.abs(xMm);
  const dyCenter = Math.abs(yMm - F11_CENTER_Y);
  const dyMiddle = Math.abs(yMm - F11_MIDDLE_Y);
  const dyOuter = Math.abs(yMm - F11_OUTER_Y);

  if (ax > F11_SILHOUETTE_HALF_W || Math.abs(yMm) > F11_SILHOUETTE_HALF_H) return 0;
  if (ax <= F11_CENTER_HALF_W && dyCenter <= F11_CENTER_HALF_H) return 5;
  if (ax <= F11_MIDDLE_HALF_W && dyMiddle <= F11_MIDDLE_HALF_H) return 4;
  if (ax <= F11_OUTER_HALF_W && dyOuter <= F11_OUTER_HALF_H) return 3;

  return 2;
}

export type TargetProfileType = "FIGURE" | "CIRCULAR";

/** Normalise any targetId string → TargetProfileType. */
export function resolveProfileType(targetId?: string): TargetProfileType {
  return targetId === "CIRCULAR" ? "CIRCULAR" : "FIGURE";
}

export function zoneFromOffset(
  xMm: number,
  yMm: number,
  isMiss: boolean,
  profileType: TargetProfileType = "FIGURE",
): "Chest" | "Body" | "Shoulder" | "Head" | "Off-Target" {
  if (isMiss) return "Off-Target";

  if (profileType === "CIRCULAR") {
    const r = Math.sqrt(xMm * xMm + yMm * yMm);
    if (r < ZONE_CHEST_MM) return "Chest";
    if (r < ZONE_SHOULDER_MM) return "Shoulder";
    if (r < ZONE_BODY_MM) return "Body";
    return "Off-Target";
  }

  // Figure 11: derive zone from score
  const score = scoreFromOffset(xMm, yMm, "FIGURE");
  switch (score) {
    case 5: return "Chest";      // cross = centre mass
    case 4: return "Shoulder";   // outer rect flanks
    case 3: return "Body";       // body outside scoring rect
    case 2: return "Head";       // head zone
    default: return "Off-Target";
  }
}

export type ScoreRingBucket = "10" | "8-9" | "6-7" | "4-5" | "miss";

export function scoreToRingBucket(
  score: number,
  profileType: TargetProfileType = "FIGURE",
): ScoreRingBucket {
  if (score <= 0) return "miss";

  if (profileType === "FIGURE") {
    // Figure 11 scale: 2 / 3 / 4 / 5
    if (score >= 5) return "10";
    if (score >= 4) return "8-9";
    if (score >= 3) return "6-7";
    return "4-5";
  }

  // Circular scale: 1–10
  if (score >= 10) return "10";
  if (score >= 8) return "8-9";
  if (score >= 6) return "6-7";
  if (score >= 4) return "4-5";
  return "miss";
}

/** Map a click on the square target container to raw sensor coordinates. Routes through clientToSvgPoint → svgPointToMm so click, drag and render all agree. Board width spans the full container (180 of 400 viewBox units) — spreading it was wrong before. Not clamped — clicking outside simulates an off-target miss. */
export function clickToSensorCoords(
  clientX: number,
  clientY: number,
  rect: RectLike,
  laneId: number,
): { x: number; y: number } {
  const svg = clientToSvgPoint(clientX, clientY, rect);
  const { xMm, yMm } = svgPointToMm(svg.x, svg.y);
  return boardMmToSensorCoords(xMm, yMm, laneId);
}