// Event reducer for useRealtimeChannels — turns one incoming WebSocketEvent
// into channel-store updates. Split out of the hook so useRealtimeChannels.ts
// stays focused on connection lifecycle (connect/reconnect/join-lane); this
// file only knows how to fold an event into the channels store.
//
// Matches lomah-nest's RealtimeGateway exactly. Notable differences from the
// old Express backend this replaced:
//   - `shot` payloads are FLAT (no nested `data.shot`) and already carry
//     board-mm coordinates with the target's calibration applied, plus the
//     authoritative `score`. Nothing is re-derived on the client.
//   - `session:cancelled` is gone: `session:completed` carries a `status` of
//     COMPLETED or CANCELLED and both paths land there.
//   - `session:sync`, `user:assigned`, `shooter:unassigned` are gone. Lane
//     binding is now a device concern (POST /auth/connect), not a per-session
//     username match — shooters have no accounts to match against.
//   - `lane:calibrated` became `target:calibrated`: offsets live on the target
//     hardware now, not the lane.

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { WebSocketEvent } from "@shared/types/events";
import type { AuthStage } from "../types";
import {
  mapRawShotToDisplay,
  mergeDisplayShots,
} from "../utils/shotCoordinates";
import { targetProfileFromTargetId } from "../utils/targetProfile";
import { toVacantLane } from "../store/channelMutations";
import { useSessionStore } from "../store/sessionStore";
import {
  clearCachedShots,
  clearCachedShotsForLane,
  setCachedShots,
} from "../db/shotCache";

export interface RealtimeEventContext {
  authStageRef: RefObject<AuthStage>;
  loggedInUsernameRef: RefObject<string>;
  shooterAssignedLaneIdRef: RefObject<number | null>;
  setShooterAssignedLaneId: Dispatch<SetStateAction<number | null>>;
  isAr: boolean;
  addAdminLog: (msg: string) => void;
  triggerSuccessBanner: (msg: string) => void;
  bindShooterToLane: (laneId: number) => void;
  syncLaneFromApi: (laneId: number) => Promise<void>;
  onFirstShotFired?: (laneId: number) => void;
}

/** Write the channel's current shot list through to IndexedDB. Fire-and-forget;
 *  a cache miss is never fatal, it just costs a blank frame on next reload. */
function cacheShots(chId: string, laneId: number) {
  const ch = useSessionStore.getState().channels.find((c) => c.id === chId);
  if (ch?.sessionId) void setCachedShots(ch.sessionId, laneId, ch.shots);
}

export function handleRealtimeEvent(
  data: WebSocketEvent,
  ctx: RealtimeEventContext,
) {
  const { setChannels } = useSessionStore.getState();
  const {
    authStageRef,
    shooterAssignedLaneIdRef,
    setShooterAssignedLaneId,
    isAr,
    addAdminLog,
    triggerSuccessBanner,
    syncLaneFromApi,
    onFirstShotFired,
  } = ctx;

  const { event } = data;

  // ── Range-wide events (no laneId) ──────────────────────────────────────────

  if (event === "sensor:gate") {
    window.dispatchEvent(
      new CustomEvent("lomah:sensor-gate", {
        detail: { adminHeld: data.adminHeld, accepting: data.accepting },
      }),
    );
    return;
  }

  if (event === "server:log") {
    // Admin-room only at the gateway, but guard here too: a shooter tablet
    // must never render backend internals even if the room scoping changes.
    if (authStageRef.current !== "ADMIN_BOARD") return;
    const time = new Date(data.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const mark = data.level === "error" ? "✖" : data.level === "warn" ? "⚠" : "";
    const where = data.context ? `${data.context}: ` : "";
    // addAdminLog stamps its own time, so this passes the SERVER's time in the
    // body — the two can differ, and the server's is the one that matters when
    // matching a UI line against the backend console.
    addAdminLog(`${mark}${mark ? " " : ""}${where}${data.message} (${time})`);
    return;
  }

  if (event === "unauthorized") {
    // The gateway disconnects immediately after sending this. Surfacing it as
    // an app event lets the shell route back to login instead of leaving the
    // user staring at a board that silently never updates.
    window.dispatchEvent(
      new CustomEvent("lomah:unauthorized", { detail: { reason: data.reason } }),
    );
    return;
  }

  if (!("laneId" in data)) return;
  const { laneId } = data;
  const chId = `CH-${laneId}`;

  switch (event) {
    case "session:created":
      // Clear cached shots for this lane so the new session cannot inherit
      // bullets from the previous one.
      void clearCachedShotsForLane(laneId);
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === chId
            ? {
                ...ch,
                name: data.shooterName || "Guest Shooter",
                opId: data.shooterName || "GUEST",
                sessionStatus: "CREATED",
                laneStatus: "CONFIGURED",
                shots: [],
                sessionId: data.sessionId,
                startTime: undefined,
                endTime: undefined,
                referenceShotId: undefined,
                calibratedShotCount: undefined,
                pickUsed: false,
              }
            : ch,
        ),
      );
      addAdminLog(
        `CREATE: Session configured for Lane ${laneId} (Shooter: ${data.shooterName || "Guest"}).`,
      );
      // The stage plan (targets, bullet limits, durations) is not on this
      // event — it lives on the session's stages[]. Pull the full record.
      void syncLaneFromApi(laneId);
      break;

    case "session:started": {
      const startPrev = useSessionStore
        .getState()
        .channels.find((c) => c.id === chId);
      const isNewSession =
        !!data.sessionId && data.sessionId !== startPrev?.sessionId;
      if (isNewSession) void clearCachedShots(data.sessionId, laneId);

      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.id !== chId) return ch;
          const fresh = isNewSession || ch.sessionStatus === "COMPLETED";
          return {
            ...ch,
            sessionStatus: "ACTIVE",
            laneStatus: "ACTIVE",
            // Stage-scoped now: the clock belongs to the stage that just
            // armed, not to the session as a whole.
            startTime: data.startedAt
              ? new Date(data.startedAt).toISOString()
              : new Date().toISOString(),
            totalPausedMs: 0,
            sessionId: data.sessionId,
            activeStageId: data.stageId,
            activeStageOrder: data.stageOrder,
            targetName: data.targetId,
            shots: fresh ? [] : ch.shots,
            referenceShotId: undefined,
            calibratedShotCount: undefined,
            pickUsed: false,
          };
        }),
      );
      // This event is only emitted after the target echoed PLAY back, so the
      // handshake mark is earned, not decorative.
      addAdminLog(`🤝 START: Target acknowledged — active shooting on Lane ${laneId}.`);
      // Stage bulletLimit/durationSeconds come from the session record.
      void syncLaneFromApi(laneId);
      break;
    }

    case "session:paused":
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === chId
            ? { ...ch, sessionStatus: "PAUSED", laneStatus: "PAUSED" }
            : ch,
        ),
      );
      addAdminLog(`PAUSE: Shooting suspended on Lane ${laneId}.`);
      break;

    case "session:resumed":
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.id !== chId) return ch;
          if (data.sessionId !== ch.sessionId) return ch;
          return {
            ...ch,
            sessionStatus: "ACTIVE",
            laneStatus: "ACTIVE",
            // Authoritative running total of paused time — the stage clock
            // subtracts this so a paused relay doesn't lose its remaining time.
            totalPausedMs: data.totalPausedMs,
            remainingSeconds: undefined,
          };
        }),
      );
      addAdminLog(`🤝 RESUME: Target re-acknowledged — shooting resumed on Lane ${laneId}.`);
      break;

    case "session:advanced": {
      // Stage N finished. If toStageId is absent this was the last stage and a
      // session:completed is already on its way — don't paint a new stage.
      if (data.toStageId === undefined) {
        addAdminLog(`ADVANCE: Lane ${laneId} finished its final stage.`);
        break;
      }
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.id !== chId) return ch;
          return {
            ...ch,
            activeStageId: data.toStageId,
            activeStageOrder: data.toStageOrder,
            // Each stage scores against its own target, so the board starts
            // clean rather than carrying the previous stage's holes.
            shots: [],
            startTime: new Date().toISOString(),
            referenceShotId: undefined,
            calibratedShotCount: undefined,
          };
        }),
      );
      addAdminLog(
        `ADVANCE: Lane ${laneId} moved to stage ${(data.toStageOrder ?? 0) + 1}.`,
      );
      void syncLaneFromApi(laneId);
      break;
    }

    case "session:completed": {
      void clearCachedShots(data.sessionId, laneId);
      const cancelled = data.status === "CANCELLED";
      setChannels((prev) =>
        prev.map((ch) =>
          // A completion only speaks for the session it names. Re-planning a
          // lane cancels its old CREATED session and immediately creates a
          // replacement (see useSessionActions.handleCreateSession), so the
          // cancel event can arrive AFTER the new session is already in state
          // — without this check it would blank a lane that has moved on.
          ch.id === chId &&
          (!ch.sessionId || ch.sessionId === data.sessionId)
            ? cancelled
              ? toVacantLane(ch)
              : {
                  ...ch,
                  sessionStatus: "COMPLETED",
                  laneStatus: "COMPLETED",
                  endTime: new Date(data.endedAt).toISOString(),
                  referenceShotId: undefined,
                  calibratedShotCount: undefined,
                  pickUsed: false,
                }
            : ch,
        ),
      );
      addAdminLog(
        cancelled
          ? `CANCEL: Session on Lane ${laneId} saved as cancelled.`
          : `COMPLETE: Session on Lane ${laneId} finished.`,
      );
      // A cancelled relay releases the tablet; a completed one stays on screen
      // for review until the admin clears it.
      if (
        cancelled &&
        authStageRef.current === "SHOOTER_BOARD" &&
        shooterAssignedLaneIdRef.current === laneId
      ) {
        setShooterAssignedLaneId(null);
        localStorage.removeItem("laneId");
      }
      void syncLaneFromApi(laneId);
      break;
    }

    case "session:reviewed":
      void clearCachedShots(data.sessionId, laneId);
      setChannels((prev) =>
        prev.map((ch) => (ch.id === chId ? toVacantLane(ch) : ch)),
      );
      addAdminLog(`REVIEW: Session on Lane ${laneId} finalized and saved.`);
      if (
        authStageRef.current === "SHOOTER_BOARD" &&
        shooterAssignedLaneIdRef.current === laneId
      ) {
        setShooterAssignedLaneId(null);
        localStorage.removeItem("laneId");
      }
      break;

    case "session:shots_reset":
      void clearCachedShots(data.sessionId, laneId);
      setChannels((prev) =>
        prev.map((ch) => (ch.id === chId ? { ...ch, shots: [] } : ch)),
      );
      addAdminLog(`RESET: Shot log cleared for Lane ${laneId}.`);
      break;

    case "shot": {
      let firstValidShotDetected = false;

      setChannels((prev) => {
        const laneChannel = prev.find((c) => c.id === chId);
        const wasEmpty = laneChannel != null && laneChannel.shots.length === 0;

        // A sentinel miss means the sensor fired but resolved nothing — there
        // are no coordinates to draw. The backend has already classified this
        // against the RAW values (before sign correction), which is the only
        // place the distinction survives; never re-derive it here.
        //
        // It is still kept. Dropping it here is what made the shot log read
        // "4, 5, 7, 13" for a thirteen-round string: the rounds were fired and
        // numbered, the list just refused to show them, which looks exactly
        // like data loss to the shooter and hides the one pattern worth
        // seeing — a run of consecutive no-detections is a board fault. What a
        // miss must NOT do is get drawn on the target, since its x/y are zero
        // and would land dead centre; TargetView filters it out there.

        if (
          authStageRef.current === "SHOOTER_BOARD" &&
          shooterAssignedLaneIdRef.current !== laneId
        ) {
          return prev;
        }

        const newShot = mapRawShotToDisplay(
          {
            shotNumber: data.shotNumber,
            x: data.x,
            y: data.y,
            isMiss: data.isMiss,
            isLost: data.isLost,
            timestamp: data.firedAt,
            // Kept per-shot so the 'D' sensor diagnostic queries the board
            // that actually saw this bullet, not whatever is armed now.
            targetId: data.targetId,
          },
          data.shotNumber,
          laneId,
          targetProfileFromTargetId(laneChannel?.targetName),
          // Server score wins: it was computed against the STAGE's profile
          // snapshot, which the client cannot reconstruct once a target has
          // been re-faced.
          data.score,
        );
        if (newShot.id <= 0) {
          console.warn("[WebSocket] Shot missing shotNumber — ignored", data);
          return prev;
        }
        if (wasEmpty) firstValidShotDetected = true;

        return prev.map((ch) => {
          if (ch.id !== chId) return ch;
          if (data.sessionId !== ch.sessionId) {
            if (!ch.sessionId) {
              return {
                ...ch,
                sessionId: data.sessionId,
                shots: mergeDisplayShots(ch.shots, [newShot]),
              };
            }
            console.warn(
              `[WebSocket] Shot session mismatch on lane ${laneId} — clearing stale shots`,
            );
            return { ...ch, sessionId: data.sessionId, shots: [newShot] };
          }
          if (ch.shots.some((s) => s.id === newShot.id)) return ch;
          return { ...ch, shots: mergeDisplayShots(ch.shots, [newShot]) };
        });
      });

      if (firstValidShotDetected) onFirstShotFired?.(laneId);

      // A no-detection and a never-arrived bullet are different faults and the
      // operator log should say which: a run of MISS points at the board's
      // sensor, a run of LOST points at the link.
      addAdminLog(
        data.isLost
          ? `SHOT: ${data.targetLabel} #${data.shotNumber} LOST (frame never arrived) on Lane ${laneId}.`
          : data.isMiss
            ? `SHOT: ${data.targetLabel} #${data.shotNumber} MISS (no detection) on Lane ${laneId}.`
            : `SHOT: ${data.targetLabel} #${data.shotNumber} (${data.score}) on Lane ${laneId}.`,
      );
      cacheShots(chId, laneId);

      // Gap detection: a shot can be lost on a degraded-but-not-disconnected
      // connection (weak wifi far from the AP) without ever firing a
      // "disconnect", so the reconnect resync never runs. stageShotCount is the
      // backend's authoritative running total for this stage at send time — if
      // this device is behind it, something never arrived.
      //
      // Both sides of this comparison must count the same things. stageShotCount
      // is every row the stage holds, misses included, so the local side cannot
      // exclude them — while misses were being dropped above, the two could
      // never agree and a full lane refetch fired on essentially every shot.
      {
        const ch = useSessionStore
          .getState()
          .channels.find((c) => c.id === chId);
        const known =
          ch?.shots.filter((s) => !s.isCalibrationMarker).length ?? 0;
        if (known < data.stageShotCount) {
          console.warn(
            `[WebSocket] Lane ${laneId} shot gap — have ${known}, backend reports ` +
              `${data.stageShotCount}. Reconciling.`,
          );
          void syncLaneFromApi(laneId);
        }
      }
      break;
    }

    case "shot:calibrated": {
      setChannels((prev) => {
        const laneChannel = prev.find((c) => c.id === chId);
        const updatedShot = mapRawShotToDisplay(
          {
            shotNumber: data.shotNumber,
            x: data.x,
            y: data.y,
            isMiss: false,
          },
          data.shotNumber,
          laneId,
          targetProfileFromTargetId(laneChannel?.targetName),
          data.score,
        );
        return prev.map((ch) => {
          if (ch.id !== chId) return ch;
          if (data.sessionId !== ch.sessionId) return ch;
          return {
            ...ch,
            shots: ch.shots.map((s) =>
              s.id === updatedShot.id ? updatedShot : s,
            ),
          };
        });
      });
      addAdminLog(
        `CALIBRATE: Lane ${laneId} shot #${data.shotNumber} repositioned.`,
      );
      if (
        authStageRef.current === "SHOOTER_BOARD" &&
        shooterAssignedLaneIdRef.current === laneId
      ) {
        triggerSuccessBanner(
          isAr
            ? `تم تصحيح موقع الطلقة #${data.shotNumber}`
            : `Shot #${data.shotNumber} position corrected`,
        );
      }
      cacheShots(chId, laneId);
      break;
    }

    case "target:calibrated": {
      // The target's mounting offset moved. The backend has already re-scored
      // every shot on that target's ACTIVE stage, so rather than replaying the
      // arithmetic here, re-pull the lane — the server is the only place that
      // knows which stage was affected.
      addAdminLog(
        `TARGET CAL: Lane ${laneId} target offset (${data.offsetXmm}, ${data.offsetYmm}) mm — ` +
          `${data.shotsUpdated} shot(s) re-scored.`,
      );
      // The offset panel reads channel.targetOffset. Update it here too, not
      // just via the sync below: a calibration that re-scored nothing (an empty
      // stage) skips that sync entirely and would leave a stale number on screen.
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === chId
            ? { ...ch, targetOffset: { x: data.offsetXmm, y: data.offsetYmm } }
            : ch,
        ),
      );
      if (data.shotsUpdated > 0) void syncLaneFromApi(laneId);
      if (
        authStageRef.current === "SHOOTER_BOARD" &&
        shooterAssignedLaneIdRef.current === laneId
      ) {
        triggerSuccessBanner(
          isAr ? "تمت معايرة الهدف" : "Target calibration applied",
        );
      }
      break;
    }

    default:
      break;
  }
}
