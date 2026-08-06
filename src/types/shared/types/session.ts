import type { TargetProfileType } from "./lane";
import type { Shot } from "./shot";

export type SessionStatus =
  | "CREATED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "SUPERSEDED";

export type StageStatus = "PENDING" | "ACTIVE" | "COMPLETED";

/**
 * One target engaged for one bullet count and time budget. A session is a
 * sequence of these — "5 rounds at 50m in 60s, then advance to 100m".
 *
 * This is the layer that did not exist in the old backend, where a session
 * held a single targetId/bulletLimit/durationSeconds directly.
 */
export interface SessionStage {
  id: string;
  sessionId: string;
  targetId: string;
  /** 0-based order within the session, nearest target first by convention. */
  order: number;
  status: StageStatus;
  startedAt: string | null;
  endedAt: string | null;
  bulletLimit: number;
  durationSeconds: number;
  /** Snapshot of the target's face at stage creation — re-facing a target
   *  later must not rescore a stage that already happened. */
  profileType: TargetProfileType;
  shots?: Shot[];
  /** The commissioned target this stage engages, enough of it to label the
   *  stage without a second round trip. Reachability fields (ipAddress,
   *  deviceId) are deliberately not included — a scorecard has no use for
   *  them. Absent on payloads that did not select it. */
  target?: {
    id: string;
    label: string;
    distanceM: number;
    positionIndex: number;
    profileType: TargetProfileType;
  };
}

export interface Session {
  id: string;
  laneId: number;
  status: SessionStatus;
  shooterId: string | null;
  shooterName: string | null;
  /** When the current pause began, null when running. Paired with
   *  totalPausedMs so the stage clock can exclude paused time. */
  pausedAt: string | null;
  totalPausedMs: number;
  notes: string | null;
  feedback: string | null;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  reviewedAt: string | null;
  stages: SessionStage[];
}
