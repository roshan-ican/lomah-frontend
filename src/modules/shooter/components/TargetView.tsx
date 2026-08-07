import React, { useRef, useMemo, useEffect } from "react";
import type { TargetViewProps } from "./target-view/types";
import { getLaneError, mmToSvgPoint } from "@shared/coordinates";
import { getLaneIdFromChannelId } from "../../../utils/helper";
import { CalibrationConfirmDialog } from "../../../components/common/CalibrationConfirmDialog";
import { SVG_VIEW_BOX, EDGE_CLAMP_PAD } from "./target-view/constants";
import { useBulkCalibrationDrag } from "./target-view/useBulkCalibrationDrag";
import { HudToolbar } from "./target-view/HudToolbar";
import { BullseyeTarget } from "./target-view/BullseyeTarget";
import { ShotMarker } from "./target-view/ShotMarker";
import { ShotListHighlight } from "./target-view/ShotListHighlight";
import { usePinchZoom } from "./target-view/usePinchZoom";

// Clamp a shot to the visible edge of the CURRENT zoom, not the fixed 400-unit
// viewBox. Zoom is a CSS `scale(zoomLevel)` on the whole board (see the
// container style below) — the SVG's own coordinate space never changes, so a
// fixed [15, 385] clamp always lands shots in the same spot on screen no
// matter how far the admin has zoomed out. Dividing the allowed half-range by
// zoomLevel keeps the on-screen padding constant while giving zoomed-out views
// proportionally more room before an off-target shot hits the edge.
function clampToEdge(cx: number, cy: number, zoomLevel: number) {
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

  const laneId = getLaneIdFromChannelId(activeChannel.id);
  const boardOffset = getLaneError(laneId);
  const hasSensorOffset = boardOffset.x !== 0 || boardOffset.y !== 0;
  const previewDx = previewOffset ? previewOffset.x - boardOffset.x : 0;
  const previewDy = previewOffset ? previewOffset.y - boardOffset.y : 0;
  const zoomLabel = `${Number(zoomLevel).toFixed(1)}x`;
  const resetZoom = () => changeZoom(1 - zoomLevel);

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

  // Two-finger pinch (and trackpad ctrl+wheel) zoom. Disabled during a bulk
  // calibration drag, where a second finger on the board means "drag with two
  // fingers", not "zoom", and where hijacking the gesture would move shots.
  usePinchZoom({
    targetRef: pinchAreaRef,
    zoomLevel,
    changeZoom,
    enabled: !isBulkCalibrate,
  });

  // PICK calibration: when the admin taps a shot in the log (which sets the
  // shared selectedShotId), mirror it onto the drag candidate set so the
  // chosen bullet is highlighted on the board and ready to drag — no need to
  // precisely grab the small marker on touch.
  useEffect(() => {
    if (calibrateMode === "pick" && selectedShotId != null) {
      setSelectedShotIds(new Set([selectedShotId]));
    }
  }, [calibrateMode, selectedShotId, setSelectedShotIds]);

  const canFire = !readOnly && !!handleTargetClick && !isBulkCalibrate;
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

  const selectShot = (sh: {
    id: number;
    score: number;
    x: number;
    y: number;
  }) => {
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
          resetZoom={resetZoom}
          toolbarExtra={toolbarExtra}
        />
      )}

      <div
        ref={pinchAreaRef}
        // pinch-zoom must be off at the CSS level too: touch-action is what
        // decides whether the browser consumes a two-finger gesture as its own
        // page zoom before any JS handler is consulted, and preventDefault()
        // in the listener cannot claw it back once that happens.
        style={{ touchAction: isBulkCalibrate ? undefined : "pan-x pan-y" }}
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
          className={`relative select-none flex items-center justify-center transition-transform duration-200 aspect-square shrink-0${
            canFire ? " cursor-crosshair" : ""
          }${isBulkCalibrate ? " touch-none" : ""}${isHud ? " mx-auto" : ""}`}
          style={{
            transform: `scale(${zoomLevel})`,
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
                const { cx, cy, wasClamped } = clampToEdge(rawCx, rawCy, zoomLevel);
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
                const { cx: x, cy: y } = clampToEdge(rawX, rawY, zoomLevel);
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
