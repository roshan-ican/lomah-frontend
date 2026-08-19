import React, { useMemo } from "react";
import { defineChart, dot, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
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

  const { data, definition } = useMemo(() => {
    const chartData = trend.map((point, index) => ({
      id: `${point.date}-${index}`,
      label: new Date(point.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      avgScore: point.avgScore,
    }));
    const labelsById = new Map(
      chartData.map((point) => [point.id, point.label] as const),
    );

    return {
      data: chartData,
      definition: defineChart({
        marks: [
          lineY(chartData, {
            x: "id",
            y: "avgScore",
            key: "id",
            stroke: lineColor,
            strokeWidth: 2,
          }),
          dot(chartData, {
            x: "id",
            y: "avgScore",
            key: "id",
            fill: lineColor,
            r: 4,
          }),
        ],
        x: {
          scale: () => scalePoint<string>().padding(0.35),
          axis: {
            ticks: {
              format: (value) => labelsById.get(value) ?? value,
            },
            tickLabels: { fontSize: 10, thin: { priority: "ends" } },
          },
        },
        y: {
          scale: scaleLinear().domain([0, 11]),
          grid: true,
          axis: {
            ticks: { count: 6 },
            tickLabels: { fontSize: 10 },
          },
        },
        theme: {
          foreground: textColor,
          muted: textColor,
          grid: gridColor,
          background: "transparent",
          palette: [lineColor],
        },
        clip: true,
        svgAnimation: true,
        tooltip: {
          use: tooltip,
          className: "lomah-chart-tooltip",
          format: (point) =>
            `${point.datum.label}: ${point.datum.avgScore.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        },
      }),
    };
  }, [gridColor, lineColor, textColor, trend]);

  const chartStyle = {
    height: "100%",
    "--ts-chart-tooltip-background": tooltipBg,
    "--ts-chart-tooltip-color": isDarkMode ? "#d5e2ff" : "#1e293b",
    "--ts-chart-tooltip-border": `1px solid ${tooltipBorder}`,
    "--ts-chart-tooltip-font":
      '11px "Helvetica Neue", Helvetica, Arial, sans-serif',
  } as React.CSSProperties;

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
          <Chart
            definition={definition}
            ariaLabel={isAr ? "اتجاه النتيجة" : "Score trend"}
            style={chartStyle}
          />
        </div>
      )}
    </div>
  );
};
