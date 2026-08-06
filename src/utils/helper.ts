// ─── Pure helpers (module-level, no hooks) ───────────────────────────────────

import type { ActiveShooterChannel, ApiSessionSnapshot, SessionStage } from "../types";
import {
  mapRawShotToDisplay,
  mergeDisplayShots,
  sortShotsNewestFirst,
} from "./shotCoordinates";
import { targetProfileFromTargetId } from "./targetProfile";

const OPEN_SESSION_STATUSES = new Set(["CREATED", "ACTIVE", "PAUSED"]);

/**
 * The live session on a lane, if any.
 *
 * Filters by status rather than taking the first row for the lane: a lane
 * accumulates finished sessions over time, and picking one of those makes the
 * lane render a dead session's state (with none of the operating controls,
 * since COMPLETED/CANCELLED/SUPERSEDED have no live branch). The backend now
 * filters too — this is the second line of defence, and covers a caller that
 * asks for ?all=true.
 */
function findOpenSessionForLane(
  sessions: ApiSessionSnapshot[],
  laneId: number,
): ApiSessionSnapshot | undefined {
  return sessions.find(
    (s) => s.laneId === laneId && OPEN_SESSION_STATUSES.has(s.status),
  );
}

function getLaneIdFromChannelId(chId: string): number {
  const num = parseInt(chId.replace("CH-", ""), 10);
  return isNaN(num) ? 1 : num;
}

function usernameMatches(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}


function resolveDisplayStage(
  session: ApiSessionSnapshot,
): SessionStage | undefined {
  return (
    session.stages?.find((s) => s.status === "ACTIVE") ?? session.stages?.[0]
  );
}

function findOpenSessionForShooter(
  sessions: ApiSessionSnapshot[],
  shooterName: string,
): ApiSessionSnapshot | undefined {
  return sessions.find(
    (s) =>
      usernameMatches(s.shooterName, shooterName) &&
      OPEN_SESSION_STATUSES.has(s.status),
  );
}

function createUnassignedShooterChannel(
  username: string,
): ActiveShooterChannel {
  return {
    id: "CH-UNASSIGNED",
    name: username || "Unassigned",
    opId: username || "UNASSIGNED",
    unit: "—",
    sessionStatus: "NONE",
    laneStatus: "AVAILABLE",
    distance: "—",
    targetName: "—",
    shots: [],
  };
}


function applyApiSessionToChannel(
  ch: ActiveShooterChannel,
  activeSession: ApiSessionSnapshot,
): ActiveShooterChannel {
  const laneId = getLaneIdFromChannelId(ch.id);
  const stage = resolveDisplayStage(activeSession);

  const mappedShots = sortShotsNewestFirst(
    (stage?.shots ?? [])
      .map((sh) =>
        mapRawShotToDisplay(
          {
            shotNumber: sh.shotNumber,
            x: sh.x,
            y: sh.y,
            isMiss: sh.isMiss,
            timestamp: sh.firedAt,
            // Carried per-shot so the 'D' sensor diagnostic can query the
            // board that actually saw this bullet even after a reload — shots
            // restored via the API sync otherwise lose targetId and the
            // query button is left disabled.
            targetId: stage?.targetId,
          },
          undefined,
          laneId,
          targetProfileFromTargetId(stage?.targetId),
          // Server score wins — it was computed against this stage's profile
          // snapshot, which the client cannot reconstruct after a re-face.
          sh.score,
        ),
      )
      .filter((sh) => sh.id > 0),
  );

  const sameSession = activeSession.id === ch.sessionId;

  return {
    ...ch,
    name: activeSession.shooterName || "Guest Shooter",
    opId: activeSession.shooterName || "GUEST",
    sessionStatus: activeSession.status,
    shots: sameSession ? mergeDisplayShots(ch.shots, mappedShots) : mappedShots,
    bulletLimit: stage?.bulletLimit,
    durationSeconds: stage?.durationSeconds,
    totalPausedMs: activeSession.totalPausedMs ?? 0,
    targetName: stage?.targetId ?? ch.targetName,
    // Read off the stage's own target, so advancing from 100m to 300m actually
    // moves the label. Falls back to whatever the lane was showing when the
    // payload has no target selected on it.
    distance: stage?.target ? `${stage.target.distanceM}m` : ch.distance,
    // Server-held mounting offset for the board this stage engages. Kept when
    // the payload didn't select the target, so a partial snapshot can't blank
    // out an offset the panel is currently showing.
    targetOffset: stage?.target
      ? { x: stage.target.offsetXmm, y: stage.target.offsetYmm }
      : ch.targetOffset,
    sessionId: activeSession.id,
    activeStageId: stage?.id,
    activeStageOrder: stage?.order,
    stageCount: activeSession.stages?.length ?? 0,
    startTime: stage?.startedAt
      ? new Date(stage.startedAt).toISOString()
      : undefined,
    endTime: activeSession.endedAt
      ? new Date(activeSession.endedAt).toISOString()
      : undefined,
    notes: activeSession.notes ?? undefined,
  };
}

export {
  getLaneIdFromChannelId,
  findOpenSessionForLane,
  usernameMatches,
  resolveDisplayStage,
  findOpenSessionForShooter,
  createUnassignedShooterChannel,
  applyApiSessionToChannel,
};
