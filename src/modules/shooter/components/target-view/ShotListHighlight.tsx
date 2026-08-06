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
        r={34}
        fill="rgba(16, 185, 129, 0.06)"
        stroke="#10B981"
        strokeWidth={1.5}
        opacity={0.9}
        className="animate-pulse"
      />
      <circle
        cx={cx}
        cy={cy}
        r={22}
        fill="none"
        stroke="#10B981"
        strokeWidth={2}
        strokeDasharray="5 3"
        className="animate-pulse"
      />
      <line
        x1={cx - 40}
        y1={cy}
        x2={cx + 40}
        y2={cy}
        stroke="#10B981"
        strokeWidth={1.4}
        opacity={0.9}
      />
      <line
        x1={cx}
        y1={cy - 40}
        x2={cx}
        y2={cy + 40}
        stroke="#10B981"
        strokeWidth={1.4}
        opacity={0.9}
      />
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#10B981"
        stroke="#ffffff"
        strokeWidth={1}
        opacity={0.95}
      />
      <text
        x={cx}
        y={cy - 44}
        textAnchor="middle"
        className="text-[9px] font-mono font-bold fill-emerald-500"
      >
        #{shotId}
      </text>
    </g>
  );
}
