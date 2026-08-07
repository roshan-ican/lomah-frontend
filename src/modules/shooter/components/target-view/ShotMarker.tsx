import { TOUCH_HIT_RADIUS, TAP_HIT_RADIUS } from "./constants";
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
            r={18}
            fill="none"
            stroke="#FF3355"
            strokeWidth={1}
            opacity={0.5}
            className="animate-[impact-pulse_1.4s_ease-out_infinite]"
            pointerEvents="none"
          />
        )}
        {isHud && !isMiss && (
          <circle
            cx={cx}
            cy={cy}
            r={12}
            fill="rgba(255, 51, 85, 0.15)"
            filter="url(#impactGlow)"
            pointerEvents="none"
          />
        )}
        {isSelected && !isListSelected && (
          <circle
            cx={cx}
            cy={cy}
            r={14}
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
            x1={cx - 4}
            y1={cy - 4}
            x2={cx + 4}
            y2={cy + 4}
            stroke={ringStroke}
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        {isMiss && isClamped && (
          <line
            x1={cx + 4}
            y1={cy - 4}
            x2={cx - 4}
            y2={cy + 4}
            stroke={ringStroke}
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        {isClamped && !isMiss && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={10}
              fill="none"
              stroke={ringStroke}
              strokeWidth={2}
              strokeDasharray="3 2"
              pointerEvents="none"
            />
            <text
              x={cx}
              y={cy + 16}
              textAnchor="middle"
              className="text-[8px] font-mono font-bold fill-amber-500 dark:fill-amber-400"
              pointerEvents="none"
            >
              OFF
            </text>
          </>
        )}
        <circle
          cx={cx}
          cy={cy}
          r={isListSelected ? 11 : canDragCalibrate ? 11 : isHud ? 8 : 7.5}
          fill={
            isMiss
              ? "transparent"
              : isHud
                ? isDarkMode
                  ? "#0B1220"
                  : "#ffffff"
                : "#1E293B"
          }
          stroke={ringStroke}
          strokeWidth={isMiss ? 2 : isListSelected ? 2.4 : isHud ? 2 : 1.8}
          strokeDasharray={isMiss && !isClamped ? "4 2" : "none"}
          pointerEvents="none"
        />
        {!isMiss && (
          <circle
            cx={cx}
            cy={cy}
            r={canDragCalibrate ? 3.5 : isHud ? 2.5 : 2}
            fill={isHud ? (isDarkMode ? "#FF3355" : "#dc2626") : "#FFFFFF"}
            pointerEvents="none"
          />
        )}
        {!isHud && (
          <text
            x={cx}
            y={cy - 12}
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
