import {
  MARKER_CLAMP_R,
  MARKER_CORE_FILL,
  MARKER_CORE_R,
  MARKER_CORE_R_DRAG,
  MARKER_CORE_STROKE,
  MARKER_EDGE_STROKE,
  MARKER_MISS_ARM,
  MARKER_PULSE_R,
  MARKER_SELECTED_R,
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
  isDarkMode: boolean;
  isDragging: boolean;
  isBulkSelected: boolean;
  isListSelected: boolean;
  isSelected: boolean;
  isNewest: boolean;
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
  isDarkMode,
  isDragging,
  isBulkSelected,
  isListSelected,
  isSelected,
  isNewest,
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

    // One size for the drawn hole, bumped only while calibrating — there the
    // marker stops being a readout and becomes a drag handle under a fingertip.
    // Selection no longer inflates it: the halo above is what marks the chosen
    // shot, and growing the hole as well made a selected shot look like a
    // bigger hit than its neighbours.
    const coreR = canDragCalibrate ? MARKER_CORE_R_DRAG : MARKER_CORE_R;

    const ringStroke = isMiss
        ? isClamped
          ? "#F59E0B"
          : "#6B7280"
        : isDragging
          ? "#8B5CF6"
          : isListSelected
            ? isHud
              ? isDarkMode
                ? "#00FFD1"
                : "#0d9488"
              : "#10B981"
            : isBulkSelected
              ? "#8B5CF6"
              : isHud
                ? isDarkMode
                  ? "#FF3355"
                  : "#dc2626"
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
        {isHud && isNewest && !isMiss && (
          <circle
            cx={cx}
            cy={cy}
            r={MARKER_PULSE_R}
            fill="none"
            stroke="#FF3355"
            strokeWidth={1}
            opacity={0.5}
            className="animate-[impact-pulse_1.4s_ease-out_infinite]"
            pointerEvents="none"
          />
        )}
        {/* The r=12 glow disc that used to sit here is gone. It was the widest
            thing on the marker and its soft edge is what made a hit read as a
            halo rather than a hole. The newest-shot pulse above already answers
            "which one just landed", and it answers it without being permanent. */}
        {isSelected && !isListSelected && (
          <circle
            cx={cx}
            cy={cy}
            r={MARKER_SELECTED_R}
            fill={
              isDragging
                ? "rgba(139, 92, 246, 0.35)"
                : "rgba(139, 92, 246, 0.2)"
            }
            stroke="#8B5CF6"
            strokeWidth={1}
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
        {isClamped && !isMiss && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={MARKER_CLAMP_R}
              fill="none"
              stroke={ringStroke}
              strokeWidth={1.4}
              strokeDasharray="3 2"
              pointerEvents="none"
            />
            <text
              x={cx}
              y={cy + MARKER_CLAMP_R + 6}
              textAnchor="middle"
              className="text-[8px] font-mono font-bold fill-amber-500 dark:fill-amber-400"
              pointerEvents="none"
            >
              OFF
            </text>
          </>
        )}
        {/* A hairline of the background colour just outside the ring. Without
            it the coloured edge sits directly on the tan of the face and the
            two blend at small sizes; with it the hole keeps a hard outline on
            any backdrop. Drawn first so the ring paints over its inner half. */}
        {!isMiss && (
          <circle
            cx={cx}
            cy={cy}
            r={coreR + MARKER_CORE_STROKE / 2 + MARKER_EDGE_STROKE / 2}
            fill="none"
            stroke={isDarkMode ? "#0B1220" : "#ffffff"}
            strokeWidth={MARKER_EDGE_STROKE}
            opacity={0.9}
            pointerEvents="none"
          />
        )}
        {/* The marker itself: one filled circle with a hard ring. What used to
            be here was this circle at r=8 PLUS a separate centre dot, which at
            board scale drew a 40mm crater with a pupil in it. */}
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
