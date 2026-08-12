// useCalibration — admin "nudge the shots/board to line up with reality" logic.
//
// Two genuinely different operations, which the old backend conflated under
// one "lane calibration" idea:
//
//  - handleShotsCalibrate: move individual shots. Corrects ONE dot; touches no
//    hardware config. POST /sessions/:id/stages/:stageId/shots/:n/calibrate
//
//  - handleLaneCalibrate / handleSetOffset: move the TARGET's mounting offset,
//    which re-scores every shot on that target's active stage. Offsets live on
//    the target hardware now, not on the lane — a lane with a 50m and a 100m
//    target has two independent offsets, and applying one board's mounting
//    error to the other (which the old lane-scoped model did) is the exact bug
//    the rewrite removed. PATCH /targets/:id/offset, POST /targets/:id/calibrate
//
// Both target operations accept ADMIN as well as SUPER_ADMIN on the backend.
// They were SUPER_ADMIN-only, which made them unreachable: this calibration
// surface exists only on the ADMIN board (SuperAdminDashboard has no target view
// to drag a shot on), so every call 403'd. Mounting error is discovered by
// firing at the board mid-relay, and correcting it is the range officer's job.

import { api } from "../utils/api";
import { targetProfileFromTargetId } from "../utils/targetProfile";
import { getLaneIdFromChannelId } from "../utils/helper";
import {
  buildCalibrationMarker,
  mapRawShotToDisplay,
  mergeDisplayShots,
} from "../utils/shotCoordinates";
import { useSessionStore } from "../store/sessionStore";
import type { AuthStage, CalibrateMode, DisplayShot, Shot, Target } from "../types";

interface CalibrationDeps {
  authStage: AuthStage;
  calibrateMode: CalibrateMode;
  selectedChannelId: string;
  isAr: boolean;
  addAdminLog: (msg: string) => void;
  triggerSuccessBanner: (msg: string) => void;
  syncLaneFromApi: (laneId: number) => Promise<void>;
  onCalibrationComplete?: () => void;
}

export function useCalibration({
  authStage,
  calibrateMode,
  selectedChannelId,
  isAr,
  addAdminLog,
  triggerSuccessBanner,
  syncLaneFromApi,
  onCalibrationComplete,
}: CalibrationDeps) {
  const { channels, setChannels } = useSessionStore();

  const inCalibrateMode = () =>
    authStage === "ADMIN_BOARD" &&
    (calibrateMode === "bulk" || calibrateMode === "pick");

  /** The session + stage a calibration call has to address. Both are required:
   *  shots hang off a stage, so there is no session-level shot to move. */
  const resolveStage = () => {
    const ch = channels.find((c) => c.id === selectedChannelId);
    if (!ch?.sessionId || !ch.activeStageId) return null;
    return {
      sessionId: ch.sessionId,
      stageId: ch.activeStageId,
      targetId: ch.targetName,
      laneId: getLaneIdFromChannelId(selectedChannelId),
    };
  };

  const handleShotCalibrate = async (
    shotNumber: number,
    x: number,
    y: number,
  ) => {
    if (!inCalibrateMode()) return null;
    const ctx = resolveStage();
    if (!ctx) {
      triggerSuccessBanner(
        isAr ? "لا توجد مرحلة نشطة للمعايرة." : "No active stage to calibrate.",
      );
      return null;
    }

    try {
      // Coordinates go up as board-mm exactly as they are drawn — the backend
      // stores board-mm too, so there is no sensor-mm round trip any more.
      // Rounded here, at the wire boundary: CalibrateShotDto is @IsInt(), and a
      // drag naturally lands on a fraction of a millimetre.
      const updated = await api.post<Shot>(
        `/sessions/${ctx.sessionId}/stages/${ctx.stageId}/shots/${shotNumber}/calibrate`,
        { x: Math.round(x), y: Math.round(y) },
      );
      const calibrated = mapRawShotToDisplay(
        {
          shotNumber: updated.shotNumber,
          x: updated.x,
          y: updated.y,
          // The drag rewrote x/y; the board's own reading is untouched by the
          // calibrate endpoint and is carried forward so the log can still show
          // how far this shot was moved.
          sensorXmm: updated.sensorXmm,
          sensorYmm: updated.sensorYmm,
          isMiss: updated.isMiss,
        },
        undefined,
        ctx.laneId,
        targetProfileFromTargetId(ctx.targetId),
        updated.score,
      );
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === selectedChannelId
            ? { ...ch, shots: mergeDisplayShots(ch.shots, [calibrated]) }
            : ch,
        ),
      );
      addAdminLog(
        `CALIBRATE: Lane ${ctx.laneId} shot #${shotNumber} → ${calibrated.score} pts.`,
      );
      return calibrated;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Calibration failed";
      triggerSuccessBanner(
        isAr
          ? `فشلت معايرة الطلقة #${shotNumber}: ${msg}`
          : `Shot #${shotNumber} failed: ${msg}`,
      );
      return null;
    }
  };

  const handleShotsCalibrate = async (
    updates: { shotNumber: number; x: number; y: number }[],
  ) => {
    if (updates.length === 0) return;
    let ok = 0;
    for (const u of updates) {
      const result = await handleShotCalibrate(u.shotNumber, u.x, u.y);
      if (result) ok++;
    }
    if (ok > 0)
      triggerSuccessBanner(
        isAr
          ? `تمت معايرة ${ok} طلقة`
          : `${ok} shot${ok === 1 ? "" : "s"} calibrated`,
      );
  };

  /**
   * "Drag this already-fired shot onto the true centre."
   *
   * The backend derives the offset from that one reference point, writes it to
   * the TARGET, and re-scores the target's active stage. Everything below the
   * API call is display bookkeeping.
   */
  const handleLaneCalibrate = async (
    referenceBoardX: number,
    referenceBoardY: number,
    trueBoardX: number,
    trueBoardY: number,
    referenceShotId: number,
  ) => {
    if (!inCalibrateMode()) return;
    const ctx = resolveStage();
    if (!ctx || !ctx.targetId) {
      triggerSuccessBanner(
        isAr ? "لا يوجد هدف للمعايرة." : "No target to calibrate.",
      );
      return;
    }

    const ch = channels.find((c) => c.id === selectedChannelId);
    // The endpoint identifies the reference by WHICH SHOT, not by coordinates —
    // the server re-reads the shot's stored position itself, so a stale local
    // copy cannot skew the derived offset.
    const referenceShot = ch?.shots.find((s) => s.id === referenceShotId);
    if (!referenceShot) {
      triggerSuccessBanner(
        isAr ? "تعذّر العثور على الطلقة المرجعية." : "Reference shot not found.",
      );
      return;
    }

    try {
      // stageId + shotNumber, NOT shotId: `referenceShotId` is the 1-based shot
      // number the board renders and selects by. The Shot row's uuid is never
      // carried into the UI's shot model, so sending it as `shotId` (which the
      // DTO validates as a uuid) failed every calibration with a 400 before it
      // reached the service.
      const target = await api.post<Target>(
        `/targets/${ctx.targetId}/calibrate`,
        {
          stageId: ctx.stageId,
          shotNumber: referenceShotId,
          trueX: Math.round(trueBoardX),
          trueY: Math.round(trueBoardY),
        },
      );

      const shotCount = ch?.shots.filter((s) => !s.isCalibrationMarker).length ?? 0;
      setChannels((prev) =>
        prev.map((c) =>
          c.id === selectedChannelId
            ? {
                ...c,
                referenceShotId,
                calibratedShotCount: shotCount,
                targetOffset: { x: target.offsetXmm, y: target.offsetYmm },
              }
            : c,
        ),
      );

      // "Calibration Applied" divider — only where there are shots to divide
      // (same guard as realtimeEventHandler; at a count of 0 the marker's id
      // sorts above shot #1 and appears on a lane nobody has fired on).
      if (shotCount > 0) {
        const marker: DisplayShot = buildCalibrationMarker(shotCount);
        setChannels((prev) =>
          prev.map((c) =>
            c.id === selectedChannelId
              ? { ...c, shots: mergeDisplayShots(c.shots, [marker]) }
              : c,
          ),
        );
      }

      // The server re-scored the stage; re-read rather than replaying the
      // arithmetic locally.
      await syncLaneFromApi(ctx.laneId);
      // Names the seam the same way the server's CALIBRATED line does, so the
      // console log and the backend log can be read against each other without
      // translating between them.
      addAdminLog(
        `TARGET CAL: ${target.label} offset (${target.offsetXmm}, ${target.offsetYmm}) mm ` +
          `from shot #${referenceShotId} — in force from shot #${shotCount + 1}.`,
      );
      triggerSuccessBanner(
        isAr
          ? `تمت معايرة الهدف — إزاحة (${target.offsetXmm}, ${target.offsetYmm}) مم`
          : `Target calibrated — offset (${target.offsetXmm}, ${target.offsetYmm}) mm`,
      );
      onCalibrationComplete?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      triggerSuccessBanner(
        isAr
          ? `تعذّرت معايرة الهدف. ${msg}`
          : `Target calibration failed. ${msg}`,
      );
    }
  };

  /** Set a target's mounting offset directly, in millimetres. */
  const handleSetOffset = async (
    laneId: number,
    offsetX: number,
    offsetY: number,
  ): Promise<boolean> => {
    if (authStage !== "ADMIN_BOARD") return false;
    const ctx = resolveStage();
    const targetId = ctx?.targetId;
    if (!targetId) {
      triggerSuccessBanner(
        isAr ? "لا يوجد هدف محدد." : "No target selected for this lane.",
      );
      return false;
    }

    try {
      const target = await api.patch<Target>(`/targets/${targetId}/offset`, {
        offsetXmm: Math.round(offsetX),
        offsetYmm: Math.round(offsetY),
      });
      // Paint the server's committed value straight away: syncLaneFromApi below
      // re-reads it, but the offset panel closes on the boolean this returns and
      // must not flash the pre-save number in between.
      setChannels((prev) =>
        prev.map((c) =>
          c.id === selectedChannelId
            ? {
                ...c,
                targetOffset: { x: target.offsetXmm, y: target.offsetYmm },
              }
            : c,
        ),
      );
      await syncLaneFromApi(laneId);
      addAdminLog(
        `TARGET OFFSET: ${target.label} set (${target.offsetXmm}, ${target.offsetYmm}) mm.`,
      );
      triggerSuccessBanner(
        isAr
          ? `تم تحديث إزاحة الهدف — (${target.offsetXmm}, ${target.offsetYmm}) مم`
          : `Target offset updated — (${target.offsetXmm}, ${target.offsetYmm}) mm`,
      );
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      triggerSuccessBanner(
        isAr
          ? `تعذّر تحديث الإزاحة. ${msg}`
          : `Offset update failed. ${msg}`,
      );
      return false;
    }
  };

  return { handleShotsCalibrate, handleLaneCalibrate, handleSetOffset };
}
