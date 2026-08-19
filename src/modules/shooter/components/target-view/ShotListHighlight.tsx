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
        r={16}
        fill="rgba(16, 185, 129, 0.05)"
        stroke="#10B981"
        strokeWidth={1.5}
        opacity={0.95}
      />
      <circle
        cx={cx}
        cy={cy}
        r={10}
        fill="none"
        stroke="#10B981"
        strokeWidth={1.2}
        strokeDasharray="3 2"
        opacity={0.9}
      />
      <line
        x1={cx - 30}
        y1={cy}
        x2={cx - 17}
        y2={cy}
        stroke="#10B981"
        strokeWidth={1.4}
        opacity={0.9}
      />
      <line
        x1={cx + 17}
        y1={cy}
        x2={cx + 30}
        y2={cy}
        stroke="#10B981"
        strokeWidth={1.4}
        opacity={0.9}
      />
      <line
        x1={cx}
        y1={cy - 30}
        x2={cx}
        y2={cy - 17}
        stroke="#10B981"
        strokeWidth={1.4}
        opacity={0.9}
      />
      <line
        x1={cx}
        y1={cy + 17}
        x2={cx}
        y2={cy + 30}
        stroke="#10B981"
        strokeWidth={1.4}
        opacity={0.9}
      />
      <text
        x={cx}
        y={cy - 34}
        textAnchor="middle"
        className="text-[9px] font-mono font-bold fill-emerald-500"
      >
        #{shotId}
      </text>
    </g>
  );
}
