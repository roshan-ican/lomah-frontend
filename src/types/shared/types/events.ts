import type { SessionStatus } from "./session";
import type { SensorGateStatus } from "./sensor";

export interface ShotEvent {
  event: "shot";
  laneId: number;
  targetId: string;
  targetLabel: string;
  sessionId: string;
  sessionStageId: string;
  /** 0-based stage index within the session, for "stage 2 of 3" displays. */
  stageOrder: number;
  shotNumber: number;
  /** Board-mm from centre, calibration already applied. */
  x: number;
  y: number;
  score: number;
  isMiss: boolean;
  /** Frame never arrived — a placeholder holding the bullet's number. */
  isLost?: boolean;
  firedAt: string;
  /** Running total for the stage, so a client reconnecting mid-stage does
   *  not start counting from zero. */
  stageShotCount: number;
}

// ── Session lifecycle ────────────────────────────────────────────────────────

export interface SessionCreatedEvent {
  event: "session:created";
  laneId: number;
  sessionId: string;
  shooterName: string | null;
}

export interface SessionStartedEvent {
  event: "session:started";
  laneId: number;
  sessionId: string;
  stageId: string;
  stageOrder: number;
  targetId: string;
  startedAt: string;
}

export interface SessionPausedEvent {
  event: "session:paused";
  laneId: number;
  sessionId: string;
  pausedAt: string;
}

export interface SessionResumedEvent {
  event: "session:resumed";
  laneId: number;
  sessionId: string;
  totalPausedMs: number;
}


export interface SessionAdvancedEvent {
  event: "session:advanced";
  laneId: number;
  sessionId: string;
  fromStageId: string;
  toStageId?: string;
  toStageOrder?: number;
}


export interface SessionCompletedEvent {
  event: "session:completed";
  laneId: number;
  sessionId: string;
  status: SessionStatus;
  endedAt: string;
}

export interface SessionReviewedEvent {
  event: "session:reviewed";
  laneId: number;
  sessionId: string;
  feedback: string;
}

export interface SessionShotsResetEvent {
  event: "session:shots_reset";
  laneId: number;
  sessionId: string;
  stageId: string;
}

export interface ShotCalibratedEvent {
  event: "shot:calibrated";
  laneId: number;
  sessionId: string;
  sessionStageId: string;
  shotId: string;
  shotNumber: number;
  x: number;
  y: number;
  score: number;
}


export interface TargetCalibratedEvent {
  event: "target:calibrated";
  laneId: number;
  targetId: string;
  offsetXmm: number;
  offsetYmm: number;
  shotsUpdated: number;
  /** Calibrations on the open session including this one; 1 means the
   *  one-bullet pick has just been spent. Null when no session was running. */
  sessionCalibrationCount: number | null;
  /** Whether the session's one-bullet pick has been spent. One-way within a
   *  session — a reset to zero does not restore it. */
  sessionPickUsed: boolean | null;
}

export interface SensorGateEvent extends SensorGateStatus {
  event: "sensor:gate";
}


export interface UnauthorizedEvent {
  event: "unauthorized";
  reason: "missing_token" | "invalid_token";
}

/** One line from the server's own logger, mirrored into the admin activity
 *  log. Admin room only — never sent to a lane. */
export interface ServerLogEvent {
  event: "server:log";
  level: "log" | "warn" | "error";
  context: string | null;
  message: string;
  /** ISO-8601, so a browser in another timezone renders it correctly. */
  timestamp: string;
}

export type SessionLifecycleEvent =
  | SessionCreatedEvent
  | SessionStartedEvent
  | SessionPausedEvent
  | SessionResumedEvent
  | SessionAdvancedEvent
  | SessionCompletedEvent
  | SessionReviewedEvent
  | SessionShotsResetEvent
  | ShotCalibratedEvent;

export type WebSocketEvent =
  | ShotEvent
  | SessionLifecycleEvent
  | TargetCalibratedEvent
  | SensorGateEvent
  | ServerLogEvent
  | UnauthorizedEvent;


export interface JoinLaneMessage {
  laneId: number;
}

export interface RoomAck {
  ok: boolean;
  room?: string;
  error?: string;
}
