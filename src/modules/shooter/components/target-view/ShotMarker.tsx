import {
  MARKER_CORE_FILL,
  MARKER_CORE_R,
  MARKER_CORE_STROKE,
  MARKER_MISS_ARM,
  TOUCH_HIT_RADIUS,
  TAP_HIT_RADIUS,
} from "./constants";
import type { ShotDragHandlers } from "./useBulkCalibrationDrag";

interface ShotMarkerProps {
  shotId: number;
  cx: number;
  cy: number;
  isMiss: boolean;
  isClamped: boolean;
  isHud: boolean;
  isBulkSelected: boolean;
  canSelectShots: boolean;
  canDragCalibrate: boolean;
  dragHandlers?: ShotDragHandlers;
  onSelect?: () => void;
}

/** A single impact marker on the target, with optional calibration drag handling. */
export function ShotMarker({
  shotId,
  cx,
  cy,
  isMiss,
  isClamped,
  isHud,
  isBulkSelected,
  canSelectShots,
  canDragCalibrate,
  dragHandlers,
  onSelect,
}: ShotMarkerProps) {
  {
    const groupClass = canSelectShots
      ? canDragCalibrate
        ? "cursor-grab active:cursor-grabbing group"
        : "cursor-pointer group"
      : "pointer-events-none";

    // Selection and calibration keep larger invisible touch targets, but the
    // visible bullet is always the same size at every score and position.
    const coreR = MARKER_CORE_R;

    const ringStroke = isMiss
        ? isClamped
          ? "#F59E0B"
          : "#6B7280"
        : "#E11D48";

    return (
      <g
        className={groupClass}
        opacity={1}
        onPointerDown={
          canDragCalibrate && !isMiss ? dragHandlers?.onPointerDown : undefined
        }
        onPointerMove={
          canDragCalibrate && !isMiss ? dragHandlers?.onPointerMove : undefined
        }
        onPointerUp={
          canDragCalibrate && !isMiss ? dragHandlers?.onPointerUp : undefined
        }
        onPointerCancel={
          canDragCalibrate && !isMiss
            ? dragHandlers?.onPointerCancel
            : undefined
        }
        onClick={
          !canSelectShots || canDragCalibrate || isMiss
            ? undefined
            : (e) => {
                e.stopPropagation();
                onSelect?.();
              }
        }
      >
        {canSelectShots && !isMiss && (
          <circle
            cx={cx}
            cy={cy}
            r={canDragCalibrate ? TOUCH_HIT_RADIUS : TAP_HIT_RADIUS}
            fill="transparent"
            pointerEvents="all"
            style={canDragCalibrate ? { touchAction: "none" } : undefined}
          />
        )}
        {canDragCalibrate && isBulkSelected && !isMiss && (
          <circle
            cx={cx}
            cy={cy}
            r={TOUCH_HIT_RADIUS + 6}
            fill="none"
            stroke="#8B5CF6"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.7}
            pointerEvents="none"
          />
        )}
        {isMiss && isClamped && (
          <line
            x1={cx - MARKER_MISS_ARM}
            y1={cy - MARKER_MISS_ARM}
            x2={cx + MARKER_MISS_ARM}
            y2={cy + MARKER_MISS_ARM}
            stroke={ringStroke}
            strokeWidth={1.5}
            pointerEvents="none"
          />
        )}
        {isMiss && isClamped && (
          <line
            x1={cx + MARKER_MISS_ARM}
            y1={cy - MARKER_MISS_ARM}
            x2={cx - MARKER_MISS_ARM}
            y2={cy + MARKER_MISS_ARM}
            stroke={ringStroke}
            strokeWidth={1.5}
            pointerEvents="none"
          />
        )}
        {/* Exactly one visible circle per recorded hit. */}
        <circle
          cx={cx}
          cy={cy}
          r={coreR}
          fill={isMiss ? "transparent" : MARKER_CORE_FILL}
          stroke={ringStroke}
          strokeWidth={isMiss ? 1.4 : MARKER_CORE_STROKE}
          strokeDasharray={isMiss && !isClamped ? "2 1.5" : "none"}
          pointerEvents="none"
        />
        {!isHud && (
          <text
            x={cx}
            y={cy - coreR - 5}
            textAnchor="middle"
            dominantBaseline="central"
            className={`text-[9px] font-mono font-bold select-none pointer-events-none group-hover:scale-110 transition-transform ${isMiss ? "fill-amber-500 dark:fill-amber-400" : "fill-rose-500 dark:fill-rose-400"}`}
          >
            #{shotId}
            {isMiss ? " MISS" : ""}
          </text>
        )}
      </g>
    );
  }
}
