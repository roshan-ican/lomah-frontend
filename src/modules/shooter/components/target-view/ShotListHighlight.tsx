/** Animated crosshair drawn over the shot currently selected in the list. */
export function ShotListHighlight({
  cx,
  cy,
  shotId,
}: {
  cx: number;
  cy: number;
  shotId: number;
}) {
  return (
    <g className="pointer-events-none select-none">
      <circle
        cx={cx}
        cy={cy}
        r={26}
        fill="rgba(16, 185, 129, 0.08)"
        stroke="#10B981"
        strokeWidth={1.5}
        className="animate-pulse"
      />
      <circle
        cx={cx}
        cy={cy}
        r={18}
        fill="none"
        stroke="#10B981"
        strokeWidth={2}
        strokeDasharray="4 3"
      />
      <line
        x1={cx - 32}
        y1={cy}
        x2={cx + 32}
        y2={cy}
        stroke="#10B981"
        strokeWidth={1.2}
        opacity={0.85}
      />
      <line
        x1={cx}
        y1={cy - 32}
        x2={cx}
        y2={cy + 32}
        stroke="#10B981"
        strokeWidth={1.2}
        opacity={0.85}
      />
      <text
        x={cx}
        y={cy - 36}
        textAnchor="middle"
        className="text-[8px] font-mono font-bold fill-emerald-500"
      >
        #{shotId}
      </text>
    </g>
  );
}
