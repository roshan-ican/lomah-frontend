import React, { useEffect, useRef, useState } from "react";
import { clientToSvgPoint, svgPointToMm } from "@shared/coordinates";
import type { CalibrateMode } from "../../../../types";
import type { CalibrationConfirmDetails } from "../../../../components/common/CalibrationConfirmDialog";
import { clampBoardMm } from "./geometry";
import {
  CENTER_LOCK_ENTER_MM,
  CENTER_LOCK_EXIT_MM,
  MOUSE_DRAG_DEAD_ZONE_MM,
  POINTER_DRAG_THRESHOLD_PX,
  TOUCH_DRAG_DEAD_ZONE_MM,
} from "./constants";
import type { PendingCalibration, ProfileType, ShotMm } from "./types";

/** Pointer handlers bound to an individual shot's `<g>` while calibrating. */
export type ShotDragHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};

interface Shot {
  id: number;
  x: number;
  y: number;
}

interface Params {
  /** Real shots only — callers must filter out calibration markers, which are
   *  display-only rows with fractional ids and no server-side shot behind them. */
  shots: Shot[];
  profileType: ProfileType;
  calibrateMode: CalibrateMode;
  onLaneCalibrate?: (
    referenceBoardX: number,
    referenceBoardY: number,
    trueBoardX: number,
    trueBoardY: number,
    referenceShotId: number,
  ) => void;
  onShotsCalibrate?: (
    updates: { shotNumber: number; x: number; y: number }[],
  ) => void;
  triggerSuccessBanner: (msg: string) => void;
  isAr: boolean;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

/**
 * Encapsulates the bulk-calibration drag interaction: selection state, live
 * drag preview, center-lock snapping, and the pending-confirmation payload.
 * All transient drag bookkeeping lives in refs to avoid stale closures inside
 * pointer handlers; React state is used only for values that must re-render.
 */
export function useBulkCalibrationDrag({
  shots,
  profileType,
  calibrateMode,
  onLaneCalibrate,
  onShotsCalibrate,
  triggerSuccessBanner,
  isAr,
  svgRef,
}: Params) {
  const isBulkCalibrate = calibrateMode === "bulk";
  const isPickCalibrate = calibrateMode === "pick";
  const canDragCalibrate =
    (isBulkCalibrate || isPickCalibrate) &&
    !!(onLaneCalibrate || onShotsCalibrate);

  const allShotIds = shots.map((s) => s.id);
  const shotIdKey = allShotIds.join(",");

  // --- Drag bookkeeping refs (never trigger renders) ---
  const draggingShotIdRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const bulkOriginsRef = useRef<Map<number, ShotMm>>(new Map());
  const pendingDragRef = useRef<{
    shotId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const lastDeltaRef = useRef<{ dX: number; dY: number } | null>(null);
  const isTouchDragRef = useRef(false);
  const centerLockedRef = useRef(false);

  // --- Render-affecting state ---
  const [draggingShotId, setDraggingShotId] = useState<number | null>(null);
  const [bulkDragPreview, setBulkDragPreview] = useState<Map<
    number,
    ShotMm
  > | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<Set<number>>(
    new Set(),
  );
  const [pendingCalibration, setPendingCalibration] =
    useState<PendingCalibration | null>(null);

  const resetDragRefs = () => {
    draggingShotIdRef.current = null;
    dragMovedRef.current = false;
    pendingDragRef.current = null;
    lastDeltaRef.current = null;
    bulkOriginsRef.current = new Map();
    isTouchDragRef.current = false;
    centerLockedRef.current = false;
  };

  useEffect(() => {
    setDraggingShotId(null);
    setBulkDragPreview(null);
    setPendingCalibration(null);
    resetDragRefs();
    if (calibrateMode !== "bulk") {
      setSelectedShotIds(new Set());
    }
  }, [calibrateMode]);

  useEffect(() => {
    if (isBulkCalibrate) {
      setSelectedShotIds(new Set(allShotIds));
    } else if (isPickCalibrate) {
      // In pick mode the admin clicks ONE bullet to mark it as the true
      // center, so start with nothing selected — selection happens on click.
      setSelectedShotIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBulkCalibrate, isPickCalibrate, shotIdKey]);

  const allShotsSelected = (ids: Set<number>) =>
    allShotIds.length > 0 && allShotIds.every((id) => ids.has(id));

  const pointerToBoardMm = (
    clientX: number,
    clientY: number,
  ): ShotMm | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const svgPoint = clientToSvgPoint(
      clientX,
      clientY,
      svg.getBoundingClientRect(),
    );
    return clampBoardMm(svgPointToMm(svgPoint.x, svgPoint.y, profileType));
  };

  const toggleAllOrNoneSelection = () => {
    setSelectedShotIds((prev) => {
      if (allShotsSelected(prev)) {
        triggerSuccessBanner(
          isAr ? "تم إلغاء تحديد جميع الطلقات" : "All shots deselected",
        );
        return new Set();
      }
      triggerSuccessBanner(
        isAr ? "تم تحديد جميع الطلقات" : "All shots selected",
      );
      return new Set(allShotIds);
    });
  };

  const updateBulkDragFromPointer = (
    clientX: number,
    clientY: number,
    anchorShotId: number,
  ) => {
    const mm = pointerToBoardMm(clientX, clientY);
    const anchorOrig = bulkOriginsRef.current.get(anchorShotId);
    if (!mm || !anchorOrig) return;

    let dX = mm.xMm - anchorOrig.xMm;
    let dY = mm.yMm - anchorOrig.yMm;

    // Use bigger lock area for touch.
    const enterLock = isTouchDragRef.current ? CENTER_LOCK_ENTER_MM : 4;
    const exitLock = isTouchDragRef.current ? CENTER_LOCK_EXIT_MM : 8;

    const previewX = anchorOrig.xMm + dX;
    const previewY = anchorOrig.yMm + dY;
    const distance = Math.hypot(previewX, previewY);

    const wasLocked = centerLockedRef.current;
    let isLocked = wasLocked;
    if (wasLocked) {
      if (distance > exitLock) isLocked = false;
    } else if (distance < enterLock) {
      isLocked = true;
    }
    centerLockedRef.current = isLocked;

    // When locked, force exact center.
    if (isLocked) {
      dX = -anchorOrig.xMm;
      dY = -anchorOrig.yMm;
    }

    // Remove floating point noise.
    dX = Math.round(dX * 10) / 10;
    dY = Math.round(dY * 10) / 10;

    // Bigger dead zone for fingers.
    const deadZone = isTouchDragRef.current
      ? TOUCH_DRAG_DEAD_ZONE_MM
      : MOUSE_DRAG_DEAD_ZONE_MM;

    const last = lastDeltaRef.current;
    const lockChanged = wasLocked !== isLocked;
    if (!lockChanged && last) {
      const drift = Math.hypot(dX - last.dX, dY - last.dY);
      if (drift < deadZone) return;
    }
    lastDeltaRef.current = { dX, dY };

    const preview = new Map<number, ShotMm>();
    for (const [id, orig] of bulkOriginsRef.current) {
      preview.set(id, { xMm: orig.xMm + dX, yMm: orig.yMm + dY });
    }
    setBulkDragPreview(preview);
  };

  const beginBulkShotDrag = (
    shotId: number,
    selectedIds: Set<number>,
    pickMode = false,
  ) => {
    let ids = selectedIds;
    if (pickMode) {
      // Pick mode: calibrate against a single chosen bullet only.
      ids = new Set([shotId]);
      setSelectedShotIds(ids);
    } else if (!allShotsSelected(ids)) {
      ids = new Set(allShotIds);
      setSelectedShotIds(ids);
    }
    if (!ids.has(shotId)) return false;

    const origins = new Map<number, ShotMm>();
    for (const id of ids) {
      const shot = shots.find((s) => s.id === id);
      if (shot) origins.set(id, { xMm: shot.x, yMm: shot.y });
    }
    if (origins.size === 0) return false;

    bulkOriginsRef.current = origins;
    return true;
  };

  const startBulkDragIfNeeded = (
    shotId: number,
    clientX: number,
    clientY: number,
    currentSelectedIds: Set<number>,
  ) => {
    if (!beginBulkShotDrag(shotId, currentSelectedIds, isPickCalibrate)) return false;
    draggingShotIdRef.current = shotId; // set ref immediately — no stale closure
    setDraggingShotId(shotId);
    dragMovedRef.current = true;
    pendingDragRef.current = null;
    lastDeltaRef.current = null; // reset so first move always registers
    updateBulkDragFromPointer(clientX, clientY, shotId);
    return true;
  };

  const finishDrag = (shotId: number, clientX: number, clientY: number) => {
    const moved = dragMovedRef.current;
    const currentPreview = bulkDragPreview;
    const anchorPreview = currentPreview?.get(shotId);
    const previewMap = currentPreview ? new Map(currentPreview) : null;
    const movedIds = new Set(bulkOriginsRef.current.keys());
    const originsSnapshot = new Map(bulkOriginsRef.current);
    const allIds = shots.map((s) => s.id);

    // Reset all refs immediately before any async state.
    resetDragRefs();
    setDraggingShotId(null);

    if (!moved || !previewMap || movedIds.size === 0) {
      setBulkDragPreview(null);
      return;
    }

    const allSelected =
      movedIds.size === allIds.length && allIds.every((id) => movedIds.has(id));

    if (allSelected && onLaneCalibrate) {
      const mm = anchorPreview
        ? clampBoardMm(anchorPreview)
        : pointerToBoardMm(clientX, clientY);
      if (!mm) {
        setBulkDragPreview(null);
        return;
      }
      const origin = originsSnapshot.get(shotId);
      setPendingCalibration({
        kind: "lane",
        anchorShotId: shotId,
        xMm: mm.xMm,
        yMm: mm.yMm,
        originMm: origin
          ? { x: origin.xMm, y: origin.yMm }
          : { x: mm.xMm, y: mm.yMm },
        shotCount: allIds.length,
      });
      return;
    }

    // Pick mode: a single bullet dragged becomes the lane reference (true
    // center). Its original position is the actual reading; the dragged-to
    // position is the "true" target center.
    if (isPickCalibrate && movedIds.size === 1 && onLaneCalibrate) {
      const pickedId = [...movedIds][0];
      const mm = anchorPreview
        ? clampBoardMm(anchorPreview)
        : pointerToBoardMm(clientX, clientY);
      if (!mm) {
        setBulkDragPreview(null);
        return;
      }
      const origin = originsSnapshot.get(pickedId);
      setPendingCalibration({
        kind: "lane",
        anchorShotId: pickedId,
        xMm: mm.xMm,
        yMm: mm.yMm,
        originMm: origin
          ? { x: origin.xMm, y: origin.yMm }
          : { x: mm.xMm, y: mm.yMm },
        shotCount: 1,
      });
      return;
    }

    if (onShotsCalibrate) {
      // Board-mm, straight through. This used to run the drag through
      // boardMmToSensorCoords first, but POST /shots/:n/calibrate takes
      // board-mm — the same space these markers are drawn in — so the extra
      // conversion sent raw 16-bit sensor words (x = 10mm went up as 65526) and
      // the backend dutifully stored them, throwing the shot off the board.
      const updates = [...movedIds].map((id) => {
        const preview = clampBoardMm(previewMap.get(id)!);
        return { shotNumber: id, x: preview.xMm, y: preview.yMm };
      });
      setPendingCalibration({
        kind: "shots",
        updates,
        shotCount: movedIds.size,
      });
      return;
    }

    setBulkDragPreview(null);
  };

  const cancelPendingCalibration = () => {
    setPendingCalibration(null);
    setBulkDragPreview(null);
    if (isBulkCalibrate) {
      setSelectedShotIds(new Set(allShotIds));
    }
  };

  /**
   * @param referenceMm the true-centre position the operator TYPED in the
   *   confirm dialog, when they measured it rather than eyeballing the drag.
   *   A drag can only ever be as accurate as the pixel the finger landed on;
   *   a tape measure against the face is better, and the dialog is the last
   *   point at which that number can still be substituted.
   *
   *   Only the reference is overridable. `originMm` stays as recorded — it is
   *   where the bullet actually is, which the operator is not in a position to
   *   revise, and the backend derives the offset from the difference.
   */
  const confirmPendingCalibration = (referenceMm?: {
    x: number;
    y: number;
  }) => {
    if (!pendingCalibration) return;
    if (pendingCalibration.kind === "lane" && onLaneCalibrate) {
      onLaneCalibrate(
        pendingCalibration.originMm.x,
        pendingCalibration.originMm.y,
        referenceMm?.x ?? pendingCalibration.xMm,
        referenceMm?.y ?? pendingCalibration.yMm,
        pendingCalibration.anchorShotId,
      );
    } else if (pendingCalibration.kind === "shots" && onShotsCalibrate) {
      onShotsCalibrate(pendingCalibration.updates);
    }
    setPendingCalibration(null);
    setBulkDragPreview(null);
    setSelectedShotIds(new Set());
  };

  const calibrationConfirmDetails: CalibrationConfirmDetails | null =
    pendingCalibration
      ? pendingCalibration.kind === "lane"
        ? {
            kind: "lane",
            shotCount: pendingCalibration.shotCount,
            anchorShotId: pendingCalibration.anchorShotId,
            referenceMm: {
              x: pendingCalibration.xMm,
              y: pendingCalibration.yMm,
            },
            originMm: pendingCalibration.originMm,
          }
        : { kind: "shots", shotCount: pendingCalibration.shotCount }
      : null;

  /** Build the pointer handler set for a shot, or `undefined` when not calibrating. */
  const getShotDragHandlers = (
    shotId: number,
  ): ShotDragHandlers | undefined => {
    if (!canDragCalibrate) return undefined;
    return {
      onPointerDown: (e) => {
        e.stopPropagation();
        // NOTE: Do NOT call e.preventDefault() here for touch pointers — it can
        // suppress subsequent pointermove events in some Chromium builds,
        // breaking touch drags. Gesture suppression is handled by the SVG's
        // `touch-action: none` (set in TargetView while calibrating).
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        dragMovedRef.current = false;
        lastDeltaRef.current = null;
        isTouchDragRef.current = e.pointerType === "touch";
        centerLockedRef.current = false;
        pendingDragRef.current = {
          shotId,
          startX: e.clientX,
          startY: e.clientY,
        };
      },
      onPointerMove: (e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const pending = pendingDragRef.current;

        // Not yet dragging — check if threshold crossed.
        if (pending?.shotId === shotId && draggingShotIdRef.current === null) {
          const dx = e.clientX - pending.startX;
          const dy = e.clientY - pending.startY;
          if (Math.hypot(dx, dy) >= POINTER_DRAG_THRESHOLD_PX) {
            startBulkDragIfNeeded(
              shotId,
              e.clientX,
              e.clientY,
              selectedShotIds,
            );
          }
          return;
        }

        // Already dragging — use ref to check, not state.
        if (draggingShotIdRef.current === shotId) {
          dragMovedRef.current = true;
          updateBulkDragFromPointer(e.clientX, e.clientY, shotId);
        }
      },
      onPointerUp: (e) => {
        e.stopPropagation();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        }
        if (draggingShotIdRef.current === shotId) {
          finishDrag(shotId, e.clientX, e.clientY);
          return;
        }
        if (
          pendingDragRef.current?.shotId === shotId &&
          !dragMovedRef.current
        ) {
          if (isPickCalibrate) {
            // Pick mode: a tap just selects this one bullet as the candidate
            // reference (highlight). Drag it to the true center to apply.
            setSelectedShotIds(new Set([shotId]));
          } else {
            toggleAllOrNoneSelection();
          }
        }
        pendingDragRef.current = null;
        dragMovedRef.current = false;
      },
      onPointerCancel: (e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        }
        if (draggingShotIdRef.current === shotId) {
          setBulkDragPreview(null);
        }
        resetDragRefs();
        setDraggingShotId(null);
      },
    };
  };

  return {
    isBulkCalibrate,
    canDragCalibrate,
    draggingShotId,
    bulkDragPreview,
    selectedShotIds,
    setSelectedShotIds,
    pendingCalibration,
    calibrationConfirmDetails,
    getShotDragHandlers,
    confirmPendingCalibration,
    cancelPendingCalibration,
  };
}
