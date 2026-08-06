import type { Lane, Target } from "./lane";
import type { Session, SessionStage, SessionStatus } from "./session";
import type { Shot } from "./shot";

/** Display bands for the ring-distribution chart. Boundaries live in the
 *  backend's toRingBucket and shared/coordinates.ts scoreToRingBucket — those
 *  two must agree or a shot is coloured differently in the report than on the
 *  live board. */
export type RingBucket = "10" | "8-9" | "6-7" | "4-5" | "miss";

/** GET /reports/sessions — COMPLETED/CANCELLED only, newest first. */
export type SessionHistoryRow = Session & {
  stages: Array<
    Pick<
      SessionStage,
      "id" | "targetId" | "order" | "bulletLimit" | "durationSeconds"
    > & { _count: { shots: number } }
  >;
};

/** GET /reports/session/:id — one session, stages with their target + shots. */
export type SessionReport = Session & {
  stages: Array<SessionStage & { target: Target; shots: Shot[] }>;
};

export interface ShooterSummary {
  sessionCount: number;
  shotCount: number;
  /** Every shot fired, sentinel misses included. Same value as shotCount —
   *  kept because the UI reads this name. */
  totalShots: number;
  /** Excludes sentinel misses. */
  hitCount: number;
  missCount: number;
  avgScore: number;
  bestScore: number;
  /** Best SESSION average, not the best single shot. */
  bestSessionAvg: number;
}

export interface ShooterTrendPoint {
  sessionId: string;
  date: string;
  shotCount: number;
  avgScore: number;
}

export interface ShooterReportSession {
  id: string;
  laneId: number;
  status: SessionStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  shotCount: number;
  /** Averaged over hits only — a sentinel miss has no coordinates, so scoring
   *  it as zero would drag the average down for a shot that may not have
   *  happened. */
  avgScore: number;
  bestScore: number;
  /** Targets engaged, in firing order. A session can span several. */
  targetIds: string[];
}

/** GET /reports/shooters/:username?from&to
 *  `username` matches Session.shooterName — shooters have no login. */
export interface ShooterReport {
  username: string;
  /** YYYY-MM-DD. Defaults to the last 30 days when from/to are omitted. */
  from: string;
  to: string;
  summary: ShooterSummary;
  trend: ShooterTrendPoint[];
  /** Bucketed rather than one entry per raw score: FIGURE scores 1–5 and
   *  CIRCULAR 1–10, so raw counts are not comparable across profiles. */
  ringDistribution: Record<RingBucket, number>;
  sessions: ShooterReportSession[];
}

export type ReportShot = Shot & { sessionId: string };

/** GET /reports/shooters/:username/shots?date | ?from&to */
export interface ShooterShotsReport {
  username: string;
  date?: string;
  from?: string;
  to?: string;
  shots: ReportShot[];
}

/** GET /system/info */
export interface SystemInfo {
  databaseUrl: string;
  shooterCount: number;
  sessionCount: number;
}

/** GET /system/lanes/sensors — lanes that have at least one target. */
export interface LaneSensorRow {
  laneId: number;
  name: string;
  targets: Array<Pick<Target, "id" | "label" | "ipAddress" | "positionIndex">>;
}

export type { Lane };
