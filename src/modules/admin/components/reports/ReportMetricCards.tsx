import React from "react";
import {
  Target,
  Award,
  BarChart2,
  TrendingUp,
  CheckCircle2,
  Crosshair,
  AlertTriangle,
} from "lucide-react";
import type { ShooterReportSummary } from "../../../../types/reports";

interface ReportMetricCardsProps {
  summary: ShooterReportSummary | null;
  loading: boolean;
  isAr: boolean;
  completionRate?: number | null;
  highScoreRate?: number | null;
  missRate?: number | null;
}

export const ReportMetricCards: React.FC<ReportMetricCardsProps> = ({
  summary,
  loading,
  isAr,
  completionRate = null,
  highScoreRate = null,
  missRate = null,
}) => {
  const cards = [
    {
      icon: Target,
      label: isAr ? "الجلسات" : "Sessions",
      value: summary?.sessionCount ?? "—",
      accent: "hud-accent",
      loading,
    },
    {
      icon: BarChart2,
      label: isAr ? "إجمالي الطلقات" : "Total Shots",
      value: summary?.totalShots ?? "—",
      accent: "hud-warning",
      loading,
    },
    {
      icon: Award,
      label: isAr ? "متوسط النتيجة" : "Avg Score",
      value: summary ? Math.round(summary.avgScore) : "—",
      accent: "hud-success",
      loading,
    },
    {
      icon: TrendingUp,
      label: isAr ? "أفضل متوسط جلسة" : "Best Session Avg",
      value: summary ? Math.round(summary.bestSessionAvg) : "—",
      accent: "hud-accent",
      loading,
    },
    {
      icon: CheckCircle2,
      label: isAr ? "معدل الإتمام" : "Completion Rate",
      value: completionRate !== null ? `${completionRate}%` : "—",
      accent: "hud-success",
      loading,
    },
    {
      icon: Crosshair,
      label: isAr ? "إصابات 8+" : "8+ Hit Rate",
      value: highScoreRate !== null ? `${highScoreRate}%` : "—",
      accent: "hud-accent",
      loading,
    },
    {
      icon: AlertTriangle,
      label: isAr ? "معدل الإخفاق" : "Miss Rate",
      value: missRate !== null ? `${missRate}%` : "—",
      accent: "hud-warning",
      loading,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
      {cards.map(
        ({ icon: Icon, label, value, accent, loading: cardLoading }) => (
          <div
            key={label}
            className="hud-glass rounded-lg p-3 flex items-center gap-2.5"
          >
            <div
              className={`p-2 rounded-lg bg-[var(--hud-accent-bg-subtle)] border border-hud ${accent}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <span className="hud-label block hud-text-subtle mb-0.5">
                {label}
              </span>
              <span className="admin-text-lg">
                {cardLoading ? "…" : value}
              </span>
            </div>
          </div>
        ),
      )}
    </div>
  );
};
