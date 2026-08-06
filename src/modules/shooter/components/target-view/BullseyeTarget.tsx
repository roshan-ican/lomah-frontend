import { bullseyeRingLabelClass, bullseyeRingStroke } from "./targetStyles";

const RING_RADII = [180, 162, 144, 126, 108, 90, 72, 54, 36, 18];
const FILLED_RINGS: Record<number, "outer" | "inner"> = {
  180: "outer",
  108: "inner",
};
const LABELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Concentric bullseye rings with scoring labels on the four cardinal axes. */
export function BullseyeTarget({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <g>
      {RING_RADII.map((r) => {
        const filled = FILLED_RINGS[r];
        const zone = filled ?? (r >= 126 ? "mid" : "inner");
        const fill = filled
          ? filled === "outer"
            ? isDarkMode
              ? "#1C1F26"
              : "#FFFFFF"
            : isDarkMode
              ? "#090A0C"
              : "#1e293b"
          : "transparent";
        return (
          <circle
            key={r}
            cx={200}
            cy={200}
            r={r}
            fill={fill}
            stroke={bullseyeRingStroke(isDarkMode, zone)}
            strokeWidth={filled ? 1.2 : r === 18 ? 1.1 : 1}
          />
        );
      })}
      <circle
        cx={200}
        cy={200}
        r={3}
        fill={isDarkMode ? "#FFFFFF" : "#f8fafc"}
      />
      {LABELS.map((val) => {
        const r = 180 - (val - 1) * 18 - 9;
        const textColor = `${bullseyeRingLabelClass(isDarkMode, val)} text-[7px]`;
        return (
          <g
            key={val}
            className={`${textColor} font-mono font-bold select-none pointer-events-none`}
          >
            <text
              x={200}
              y={200 - r}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {val}
            </text>
            <text
              x={200}
              y={200 + r}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {val}
            </text>
            <text
              x={200 - r}
              y={200}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {val}
            </text>
            <text
              x={200 + r}
              y={200}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {val}
            </text>
          </g>
        );
      })}
    </g>
  );
}
