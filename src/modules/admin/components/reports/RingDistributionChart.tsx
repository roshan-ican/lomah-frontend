import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { ShooterReportPayload } from "../../../../types/reports";

const RING_COLORS: Record<string, string> = {
  "10": "#059669",
  "8-9": "#378ADD",
  "6-7": "#E8A838",
  "4-5": "#E87838",
  miss: "#dc2626",
};

const RING_COLORS_DARK: Record<string, string> = {
  "10": "#00ff88",
  "8-9": "#4494e7",
  "6-7": "#ffb020",
  "4-5": "#ff9f1c",
  miss: "#ff3355",
};

interface RingDistributionChartProps {
  ringDistribution: ShooterReportPayload["ringDistribution"];
  isDarkMode: boolean;
  isAr: boolean;
  className?: string;
}

export const RingDistributionChart: React.FC<RingDistributionChartProps> = ({
  ringDistribution,
  isDarkMode,
  isAr,
  className = "",
}) => {
  const palette = isDarkMode ? RING_COLORS_DARK : RING_COLORS;
  const tooltipBg = isDarkMode ? "#0b1220" : "#ffffff";
  const tooltipBorder = isDarkMode ? "rgba(0, 255, 209, 0.15)" : "#cbd5e1";
  const legendColor = isDarkMode ? "rgba(213, 226, 255, 0.55)" : "#64748b";

  const data = Object.entries(ringDistribution).map(([name, value]) => ({
    name: name === "miss" ? "Miss" : `${name} ring`,
    value,
    key: name,
  }));

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div
      className={`hud-glass rounded-lg p-3 flex flex-col min-h-0 ${className}`}
    >
      <h3 className="hud-label hud-accent mb-1 shrink-0">
        {isAr ? "توزيع الحلقات" : "Shots by ring"}
      </h3>

      {total === 0 ? (
        <p className="admin-text-xs hud-text-muted font-mono text-center flex-1 flex items-center justify-center">
          {isAr ? "لا توجد طلقات" : "No shots in range"}
        </p>
      ) : (
        <>
          <div className="h-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={26}
                  outerRadius={46}
                  paddingAngle={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.key} fill={palette[entry.key] ?? "#888"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    fontSize: 11,
                    fontFamily:
                      '"Helvetica Neue", Helvetica, Arial, sans-serif',
                    color: isDarkMode ? "#d5e2ff" : "#1e293b",
                  }}
                  formatter={(value, name) => {
                    const n = Number(value) || 0;
                    return [
                      `${n} (${total > 0 ? Math.round((n / total) * 100) : 0}%)`,
                      String(name),
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div
            className="shrink-0 flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1 pb-0.5"
            style={{
              fontSize: 10,
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
              color: legendColor,
            }}
          >
            {data.map((entry) => (
              <span key={entry.key} className="flex items-center gap-1">
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: palette[entry.key] ?? "#888",
                    flexShrink: 0,
                  }}
                />
                {entry.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
