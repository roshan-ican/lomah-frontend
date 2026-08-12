import React, { useRef, useMemo, useEffect } from "react";
import type { TargetViewProps } from "./target-view/types";
import {
  mmToSvgPoint,
  SVG_VIEW_SIZE,
  TARGET_HALF_HEIGHT_MM,
  TARGET_HALF_WIDTH_MM,
} from "@shared/coordinates";
import { CalibrationConfirmDialog } from "../../../components/common/CalibrationConfirmDialog";
import { SVG_VIEW_BOX, EDGE_CLAMP_PAD } from "./target-view/constants";
import { useBulkCalibrationDrag } from "./target-view/useBulkCalibrationDrag";
import { HudToolbar } from "./target-view/HudToolbar";
import { BullseyeTarget } from "./target-view/BullseyeTarget";
import { ShotMarker } from "./target-view/ShotMarker";
import { ShotListHighlight } from "./target-view/ShotListHighlight";
import { usePanZoom } from "./target-view/usePanZoom";
import { CLICK_TO_FIRE_ENABLED } from "../../../utils/featureFlags";

/**
 * Pull a shot that missed the paper in to the edge of the current view so it
 * still reads as "it went that way", and leave every shot that actually hit
 * the face exactly where it hit.
 *
 * The edge bound is the visible region of the current zoom —
 * `(200 - PAD) / zoomLevel` — so an off-face marker stays in frame as the
 * operator zooms rather than disappearing along with the metre of empty air it
 * represents. That behaviour is the point of the badge and is unchanged.
 *
 * What changed is WHO it applies to. The bound used to be the only test, which
 * made "clamped" mean "outside your current viewport" rather than "off the
 * target", and swept up honest shots the moment anyone zoomed. A hit at
 * (225, 493)mm is the top-right corner of a 450×1000mm face — a real, scoring
 * impact. At 1.7x it fell outside the centred half-range, so it was dragged to
 * (290, 91.2), badged OFF, and drawn ~220mm from where it landed — on the exact
 * pixel as a shot at (225, 1414)mm, nearly a metre above the board. One painted
 * over the other and the real one lost.
 *
 * The face maps onto the viewBox by construction (±500mm of board is the full
 * 0–400 of SVG y), so an on-face shot is always somewhere in the board's own
 * coordinate space and never needs moving. If it is off screen at the current
 * zoom, panning to it is the answer — not dragging it into frame under a label
 * that misstates where it hit.
 */
function clampToEdge(
  cx: number,
  cy: number,
  xMm: number,
  yMm: number,
  zoomLevel: number,
) {
  const onFace =
    Math.abs(xMm) <= TARGET_HALF_WIDTH_MM &&
    Math.abs(yMm) <= TARGET_HALF_HEIGHT_MM;
  if (onFace) return { cx, cy, wasClamped: false };

  const halfRange = (200 - EDGE_CLAMP_PAD) / (zoomLevel || 1);
  const min = 200 - halfRange;
  const max = 200 + halfRange;
  const clampedCx = Math.min(max, Math.max(min, cx));
  const clampedCy = Math.min(max, Math.max(min, cy));
  return {
    cx: clampedCx,
    cy: clampedCy,
    wasClamped: clampedCx !== cx || clampedCy !== cy,
  };
}

export const TargetView: React.FC<TargetViewProps> = ({
  activeChannel,
  profileType,
  setProfileType,
  zoomLevel,
  changeZoom,
  isDarkMode,
  selectedShotId,
  setSelectedShotId,
  targetContainerRef,
  targetSvgRef,
  handleTargetClick,
  onLaneCalibrate,
  onShotsCalibrate,
  calibrateMode = "off",
  triggerSuccessBanner,
  language,
  compact = false,
  readOnly = false,
  variant = "default",
  distance,
  size = "default",
  embedded = false,
  hideHudStatus = false,
  lockProfileType = false,
  toolbarExtra,
  previewOffset = null,
}) => {
  const isAr = language === "ar";
  const isHud = variant === "hud";
  const isFill = size === "fill";
  const isSimulator = size === "simulator";
  const targetSizePx = isFill
    ? 0
    : isSimulator
      ? 1020
      : size === "hero"
        ? embedded
          ? 520
          : 680
        : isHud
          ? 560
          : 340;

  // The board's committed mounting offset, as the server reports it on every
  // lane sync — NOT the client-side lane-error cache (getLaneError), which
  // nothing populates and always answers (0, 0). Reading that here meant a
  // preview during an edit was computed as (draft - 0) instead of
  // (draft - committed), so on any target that already had a nonzero offset
  // the live bullet-shift preview was wrong by exactly that offset.
  const boardOffset = activeChannel.targetOffset ?? { x: 0, y: 0 };
  const hasSensorOffset = boardOffset.x !== 0 || boardOffset.y !== 0;
  const previewDx = previewOffset ? previewOffset.x - boardOffset.x : 0;
  const previewDy = previewOffset ? previewOffset.y - boardOffset.y : 0;
  const zoomLabel = `${Number(zoomLevel).toFixed(1)}x`;

  const svgRef = useRef<SVGSVGElement>(null);
  const pinchAreaRef = useRef<HTMLDivElement>(null);

  /**
   * Shots that have a real position on the face.
   *
   * Misses are excluded, not styled differently. A no-detection carries x=0
   * y=0 — not "the sensor saw nothing" but literal dead centre — so plotting
   * one draws a marker on the bullseye, and a run of them stacks the whole run
   * there. They belong in the shot log, which is where they now appear; here
   * they can only lie. Dropping them also keeps them out of calibration drag
   * and out of the newest-shot highlight, both of which need a real impact.
   */
  const calibratableShots = useMemo(
    () =>
      activeChannel.shots.filter(
        (sh) => !sh.isCalibrationMarker && !sh.isMiss && !sh.isLost,
      ),
    [activeChannel.shots],
  );

  const shotSvgPoints = useMemo(() => {
    return calibratableShots.map((sh) => {
      const { x, y } = mmToSvgPoint(sh.x, sh.y, profileType);
      return { shotId: sh.id, cx: x, cy: y };
    });
  }, [calibratableShots, profileType]);

  const hasOffScreenShots = useMemo(() => {
    if (activeChannel.shots.length === 0) return false;
    return shotSvgPoints.some(
      (p) => p.cx < -20 || p.cx > 420 || p.cy < -20 || p.cy > 420,
    );
  }, [shotSvgPoints, activeChannel.shots.length]);

  const fitAllShots = () => {
    if (shotSvgPoints.length === 0) return;
    // Distance of each shot from the viewport centre (200,200) in SVG units.
    const maxDist = shotSvgPoints.reduce(
      (m, p) => Math.max(m, Math.abs(p.cx - 200), Math.abs(p.cy - 200)),
      0,
    );
    if (maxDist <= 180) {
      // Everything already fits inside the board — snap back to 1x.
      changeZoom(1 - zoomLevel);
      return;
    }
    // Zoom so the most distant shot stays inside the 400-unit viewport with padding.
    const PAD = 40;
    const fitZoom = (200 - PAD) / maxDist;
    const targetZoom = Math.min(zoomLevel, Math.max(0.1, fitZoom));
    changeZoom(targetZoom - zoomLevel);
  };

  const {
    isBulkCalibrate,
    canDragCalibrate,
    draggingShotId,
    bulkDragPreview,
    selectedShotIds,
    setSelectedShotIds,
    calibrationConfirmDetails,
    getShotDragHandlers,
    confirmPendingCalibration,
    cancelPendingCalibration,
  } = useBulkCalibrationDrag({
    shots: calibratableShots,
    profileType,
    calibrateMode,
    onLaneCalibrate,
    onShotsCalibrate,
    triggerSuccessBanner,
    isAr,
    svgRef,
  });

  // Pinch, ctrl+wheel and drag-to-pan. Disabled during a bulk calibration
  // drag, where a second finger on the board means "drag with two fingers",
  // not "zoom", and where hijacking the gesture would move shots.
  const { pan, isPanning, panHandlers, reset: resetView } = usePanZoom({
    targetRef: pinchAreaRef,
    zoomLevel,
    changeZoom,
    enabled: !isBulkCalibrate,
  });

  // PICK calibration: when the admin taps a shot in the log (which sets the
  // shared selectedShotId), mirror it onto the drag candidate set so the
  // chosen bullet is highlighted on the board and ready to drag — no need to
  // precisely grab the small marker on touch.
  //
  // Deselecting has to mirror too. The log lets a second tap on the chosen
  // shot clear the selection; if only the non-null case were handled, the
  // board would keep the old bullet lit and draggable after the log had
  // stopped showing anything as picked — two surfaces disagreeing about which
  // shot a calibration is about to move.
  useEffect(() => {
    if (calibrateMode !== "pick") return;
    setSelectedShotIds(
      selectedShotId != null ? new Set([selectedShotId]) : new Set(),
    );
  }, [calibrateMode, selectedShotId, setSelectedShotIds]);

  // CLICK_TO_FIRE_ENABLED is off: a tap on the board no longer forges a shot.
  // See featureFlags.ts for why, and flip it there to restore local testing.
  const canFire =
    CLICK_TO_FIRE_ENABLED && !readOnly && !!handleTargetClick && !isBulkCalibrate;
  // Selecting a shot only highlights it — it mutates nothing on the server and
  // nothing on the board. `readOnly` gates FIRING (see canFire above, which
  // checks it independently), so tying selection to it as well was what made
  // the admin lane board — which is always readOnly — refuse taps on bullets
  // and force the shot log to be the only way in.
  const canSelectShots = true;
  const newestShotId =
    calibratableShots.length > 0
      ? Math.max(...calibratableShots.map((s) => s.id))
      : null;

  /**
   * Tap a bullet to select it; tap the selected one again to clear it.
   *
   * Same toggle the shot log uses, and it has to be here too or the two
   * surfaces disagree about how selection works — a shot picked on the board
   * could only be released from the list, which is not obvious and is awkward
   * on a touch screen where the list may be scrolled somewhere else entirely.
   */
  const selectShot = (sh: {
    id: number;
    score: number;
    x: number;
    y: number;
  }) => {
    if (selectedShotId === sh.id) {
      setSelectedShotId(null);
      triggerSuccessBanner(
        isAr ? `تم إلغاء تحديد الطلقة #${sh.id}` : `Cleared Shot #${sh.id}`,
      );
      return;
    }
    setSelectedShotId(sh.id);
    triggerSuccessBanner(
      isAr
        ? `تم تحديد طلقة #${sh.id}: (${sh.score} نقطة) — X:${sh.x}mm Y:${sh.y}mm`
        : `Selected Shot #${sh.id}: [${sh.score} Pts] X:${sh.x}mm Y:${sh.y}mm`,
    );
  };

  return (
    <div
      className={
        compact || embedded || isFill
          ? "h-full flex flex-col min-h-0 w-full"
          : isHud
            ? "flex flex-col gap-5"
            : "flex flex-col gap-4"
      }
    >
      {!compact && isHud && (
        <HudToolbar
          activeChannel={activeChannel}
          hasSensorOffset={hasSensorOffset}
          distance={distance}
          profileType={profileType}
          setProfileType={setProfileType}
          isAr={isAr}
          compact={compact}
          embedded={embedded}
          hideHudStatus={hideHudStatus}
          lockProfileType={lockProfileType}
          zoomLabel={zoomLabel}
          changeZoom={changeZoom}
          // Resets the pan as well as the zoom. They are one view state, and
          // returning to 1x while still offset would leave the board parked
          // off-centre with the button that just "reset" it now doing nothing.
          resetZoom={resetView}
          toolbarExtra={toolbarExtra}
        />
      )}

      <div
        ref={pinchAreaRef}
        {...panHandlers}
        // pinch-zoom must be off at the CSS level too: touch-action is what
        // decides whether the browser consumes a two-finger gesture as its own
        // page zoom before any JS handler is consulted, and preventDefault()
        // in the listener cannot claw it back once that happens.
        //
        // "none" once zoomed in, so a one-finger drag reaches the pan handlers
        // instead of being eaten as a page scroll. At 1x there is nothing to
        // pan to, so the page keeps its normal scrolling.
        style={{
          touchAction: isBulkCalibrate
            ? undefined
            : zoomLevel > 1
              ? "none"
              : "pan-x pan-y",
          cursor:
            !isBulkCalibrate && zoomLevel > 1
              ? isPanning
                ? "grabbing"
                : "grab"
              : undefined,
        }}
        className={`relative flex items-center justify-center ${
          hasOffScreenShots
            ? "overflow-hidden"
            : isBulkCalibrate
              ? "overflow-visible"
              : zoomLevel > 1
                ? "overflow-hidden"
                : isFill
                  ? "overflow-visible"
                  : "overflow-visible"
        } ${
          compact
            ? "flex-1 min-h-0 py-2"
            : isHud && (isSimulator || isFill)
              ? "flex-1 min-h-0 w-full"
              : isHud
                ? "py-4 w-full"
                : `aspect-square py-6 rounded-2xl border shadow-sm ${
                    isDarkMode
                      ? "bg-[#121417]/60 border-glass-border/40"
                      : "bg-white border-gray-200"
                  }`
        }`}
      >
        {isHud && (
          <div
            className="absolute inset-0 hud-scan-overlay rounded-full"
            aria-hidden
          />
        )}
        <div
          ref={targetContainerRef}
          onClick={canFire ? handleTargetClick : undefined}
          // No transition while the finger is down: a 200ms ease on every pan
          // frame turns a drag into the board sliding after the pointer.
          className={`relative select-none flex items-center justify-center aspect-square shrink-0${
            isPanning ? "" : " transition-transform duration-200"
          }${canFire ? " cursor-crosshair" : ""}${
            isBulkCalibrate ? " touch-none" : ""
          }${isHud ? " mx-auto" : ""}`}
          style={{
            // Translate BEFORE scale. The pan is measured in screen pixels —
            // it comes from pointer deltas — and putting it first keeps it in
            // that space; after the scale it would be multiplied by the zoom
            // and the board would bolt away from the cursor.
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
            transformOrigin: "center center",
            width: isFill
              ? "100%"
              : isSimulator
                ? "min(78vmin, min(96vw, 920px))"
                : `${targetSizePx}px`,
            height: isFill
              ? "100%"
              : isSimulator
                ? "min(78vmin, min(96vw, 920px))"
                : `${targetSizePx}px`,
            maxWidth: isFill
              ? "100%"
              : isSimulator
                ? "min(96vw, 920px)"
                : isHud
                  ? "min(90vw, 560px)"
                  : undefined,
            maxHeight: isFill ? "100%" : undefined,
            touchAction:
              isBulkCalibrate || (calibrateMode === "pick" && canDragCalibrate)
                ? "none"
                : "manipulation",
          }}
        >
          <svg
            ref={(el) => {
              (svgRef as React.MutableRefObject<SVGSVGElement | null>).current =
                el;
              if (targetSvgRef) {
                (
                  targetSvgRef as React.MutableRefObject<SVGSVGElement | null>
                ).current = el;
              }
            }}
            className="w-full h-full overflow-visible"
            viewBox={SVG_VIEW_BOX}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {isHud && (
              <defs>
                <filter
                  id="impactGlow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            )}
            {profileType === "FIGURE" ? (
              <g>
                <image
                  href="/Fig11Target.jpg"
                  x="40"
                  y="0"
                  width="320"
                  height="400"
                  preserveAspectRatio="xMidYMid meet"
                />
              </g>
            ) : (
              <BullseyeTarget isDarkMode={isDarkMode} />
            )}
            {/* Single shot rendering with clamping for misses */}
            {[...calibratableShots]
              .sort((a, b) => a.id - b.id)
              .map((sh) => {
                const bulkPreview = bulkDragPreview?.get(sh.id);
                const xMm = (bulkPreview?.xMm ?? sh.x) + previewDx;
                const yMm = (bulkPreview?.yMm ?? sh.y) + previewDy;
                const { x: rawCx, y: rawCy } = mmToSvgPoint(xMm, yMm, profileType);
                const { cx, cy, wasClamped } = clampToEdge(
                  rawCx,
                  rawCy,
                  xMm,
                  yMm,
                  zoomLevel,
                );
                const isMiss = sh.isMiss ?? false;
                const isDragging = draggingShotId === sh.id;
                const isBulkSelected =
                  isBulkCalibrate && selectedShotIds.has(sh.id);
                const isListSelected = selectedShotId === sh.id;
                const isSelected = isBulkCalibrate
                  ? isBulkSelected || isDragging
                  : isListSelected || isDragging;

                return (
                  <ShotMarker
                    key={sh.id}
                    shotId={sh.id}
                    cx={cx}
                    cy={cy}
                    isMiss={isMiss}
                    isClamped={wasClamped}
                    isHud={isHud}
                    isDarkMode={isDarkMode}
                    isDragging={isDragging}
                    isBulkSelected={isBulkSelected}
                    isListSelected={isListSelected}
                    isSelected={isSelected}
                    isNewest={sh.id === newestShotId}
                    canSelectShots={canSelectShots}
                    canDragCalibrate={canDragCalibrate}
                    dragHandlers={getShotDragHandlers(sh.id)}
                    onSelect={() => selectShot(sh)}
                  />
                );
              })}
            {selectedShotId != null &&
              draggingShotId !== selectedShotId &&
              (() => {
                const sh = activeChannel.shots.find(
                  (s) => s.id === selectedShotId,
                );
                if (!sh) return null;
                const bulkPreview = bulkDragPreview?.get(sh.id);
                const xMm = (bulkPreview?.xMm ?? sh.x) + previewDx;
                const yMm = (bulkPreview?.yMm ?? sh.y) + previewDy;
                const { x: rawX, y: rawY } = mmToSvgPoint(xMm, yMm, profileType);
                // Same rule as the marker, or the highlight ring and the shot
                // it is meant to be circling end up in two different places.
                const { cx: x, cy: y } = clampToEdge(
                  rawX,
                  rawY,
                  xMm,
                  yMm,
                  zoomLevel,
                );
                return (
                  <ShotListHighlight cx={x} cy={y} shotId={selectedShotId} />
                );
              })()}
          </svg>
        </div>
      </div>

      <CalibrationConfirmDialog
        open={calibrationConfirmDetails != null}
        details={calibrationConfirmDetails}
        language={language}
        onConfirm={confirmPendingCalibration}
        onCancel={cancelPendingCalibration}
      />
    </div>
  );
};
