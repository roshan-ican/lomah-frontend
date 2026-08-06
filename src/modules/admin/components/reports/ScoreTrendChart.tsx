import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ShooterTrendPoint } from "../../../../types/reports";

interface ScoreTrendChartProps {
  trend: ShooterTrendPoint[];
  isDarkMode: boolean;
  isAr: boolean;
  className?: string;
}

export const ScoreTrendChart: React.FC<ScoreTrendChartProps> = ({
  trend,
  isDarkMode,
  isAr,
  className = "",
}) => {
  const gridColor = isDarkMode
    ? "rgba(0, 255, 209, 0.12)"
    : "rgba(13, 148, 136, 0.15)";
  const textColor = isDarkMode ? "rgba(213, 226, 255, 0.45)" : "#64748b";
  const lineColor = isDarkMode ? "#00ff88" : "#059669";
  const tooltipBg = isDarkMode ? "#0b1220" : "#ffffff";
  const tooltipBorder = isDarkMode ? "rgba(0, 255, 209, 0.15)" : "#cbd5e1";

  const data = trend.map((t) => ({
    label: new Date(t.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    avgScore: t.avgScore,
  }));

  return (
    <div
      className={`hud-glass rounded-lg p-3 flex flex-col min-h-0 ${className}`}
    >
      <h3 className="hud-label hud-accent mb-2 shrink-0">
        {isAr ? "اتجاه النتيجة" : "Score trend"}
      </h3>
      {data.length === 0 ? (
        <p className="admin-text-xs hud-text-muted font-mono text-center flex-1 flex items-center justify-center">
          {isAr ? "لا توجد بيانات" : "No session data in range"}
        </p>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 10 }} />
              <YAxis
                domain={[0, 11]}
                tick={{ fill: textColor, fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  fontSize: 11,
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                  color: isDarkMode ? "#d5e2ff" : "#1e293b",
                }}
              />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke={lineColor}
                strokeWidth={2}
                dot={{ fill: lineColor, r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
