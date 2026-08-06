import type {
  Session,
  SessionStage,
  SessionStatus,
} from "@shared/types/session";

export interface Operator {
  operatorId: string;
  fullName: string;
  unit: string;
  accessKey?: string;
  createdAt: string;
}

/** UI display shot (zone/score computed on the client). */
export interface DisplayShot {
  id: number;
  score: number;
  x: number;
  y: number;
  zone: "Chest" | "Body" | "Shoulder" | "Head" | "Off-Target";
  timestamp: string;
  isMiss?: boolean;
  isCalibrationMarker?: boolean;
  /** Which board reported this shot. Carried per-shot rather than read off the
   *  lane's current target because a session spans stages, each against a
   *  different target — the 'D' diagnostic for shot #3 must go to the board
   *  that actually saw it, not to whatever is armed now. */
  targetId?: string;
}

export type { SessionStatus };

/** Frontend lane UI includes NONE when no session is configured. */
export type LaneSessionStatus = SessionStatus | "NONE";

/** Admin target calibration: off, bulk (drag whole group), or pick (mark one bullet as the true center). */
export type CalibrateMode = "off" | "bulk" | "pick";

/** Which screen the main app window is showing (auth gate → board). */
export type AuthStage =
  "PORTAL" | "LOGIN_ADMIN" | "LOGIN_SHOOTER" | "ADMIN_BOARD" | "SHOOTER_BOARD";

/** Map AuthStage values to hash-based routes. */
export const AUTH_STAGE_PATH: Record<AuthStage, string> = {
  PORTAL: "/",
  LOGIN_ADMIN: "/login/admin",
  LOGIN_SHOOTER: "/login/shooter",
  ADMIN_BOARD: "/admin",
  SHOOTER_BOARD: "/shooter",
};

/** Derive an AuthStage from a hash-fragment pathname (e.g. "/admin" → "ADMIN_BOARD"). */
export function authStageFromPath(pathname: string): AuthStage {
  if (pathname.startsWith("/admin")) return "ADMIN_BOARD";
  if (pathname.startsWith("/shooter")) return "SHOOTER_BOARD";
  if (pathname.startsWith("/login/admin")) return "LOGIN_ADMIN";
  if (pathname.startsWith("/login/shooter")) return "LOGIN_SHOOTER";
  return "PORTAL";
}

export interface ActiveShooterChannel {
  id: string;
  name: string;
  opId: string;
  unit: string;
  sessionStatus: LaneSessionStatus;
  laneStatus?: string;
  shots: DisplayShot[];
  distance: string;
  targetName: string;
  bulletLimit?: number;
  durationSeconds?: number;
  totalPausedMs?: number;
  remainingSeconds?: number;
  sessionId?: string;
  /** The stage currently being fired. A session is a sequence of stages, each
   *  against one target with its own bullet limit and clock — this is which
   *  one is live, and what `startTime`/`bulletLimit` above describe. */
  activeStageId?: string;
  /** 0-based position of that stage, for "stage 2 of 3" displays. */
  activeStageOrder?: number;
  /** How many stages the session has in total. Together with
   *  activeStageOrder this is what decides whether "advance" is offered —
   *  advancing past the last stage completes the session instead. */
  stageCount?: number;
  startTime?: string;
  endTime?: string;
  notes?: string;
  /** Shot id the admin designated as the calibration reference (true-center anchor). */
  referenceShotId?: number;
  /** Once pick mode has been chosen on this session, it can never be entered
   *  again — subsequent calibrations are bulk-only. Set the moment pick is
   *  entered, so even toggling off without completing blocks pick reuse. */
  pickUsed?: boolean;
  /** Total shots present when calibration was first applied. Shots with id <= this
   *  are "old" (dimmed); shots arriving after are "new" (hard red). */
  calibratedShotCount?: number;
  /** The active stage's TARGET mounting offset, in board-mm, as the server
   *  holds it. The source of truth for the offset panel — it used to read a
   *  client-side lane-error cache that nothing ever filled, so it always showed
   *  (0, 0) and a saved offset appeared to revert on the next render. */
  targetOffset?: { x: number; y: number };
}

export interface TargetProfile {
  id: string;
  name: string;
  image: string;
}

/**
 * What GET /sessions and GET /sessions/:id actually return.
 *
 * This is the full Session record now, stages included — the old flat snapshot
 * (one targetId, one bulletLimit, one durationSeconds on the session itself)
 * no longer exists, because those are per-stage properties.
 */
export type ApiSessionSnapshot = Session;

/** The stage a session is currently firing, or undefined between stages. */
export function activeStageOf(
  session: Pick<Session, "stages">,
): SessionStage | undefined {
  return session.stages?.find((s) => s.status === "ACTIVE");
}

export type { Session, SessionStage, StageStatus } from "@shared/types/session";
export type {
  Lane,
  Target,
  LaneStatus,
  TargetProfileType,
  TargetFrameExchange,
  TargetSelfTestResult,
  TargetPlayResult,
  TargetStopResult,
  TargetHeartbeatResult,
  TargetDevDataResult,
  SelfTestOutcome,
  WiperPage,
  WiperPageValues,
} from "@shared/types/lane";
export type { Shot } from "@shared/types/shot";
export type {
  User,
  UserRole,
  LoginResponse,
  ConnectedShooter,
} from "@shared/types/user";
export type { WebSocketEvent } from "@shared/types/events";
export type { SensorGateStatus } from "@shared/types/sensor";
export type {
  SessionHistoryRow,
  SessionReport,
  ShooterReport,
  ShooterShotsReport,
  ShooterSummary,
  ShooterTrendPoint,
  ReportShot,
  SystemInfo,
  LaneSensorRow,
} from "@shared/types/reports";
export type { Shooter } from "@shared/types/shooter";
