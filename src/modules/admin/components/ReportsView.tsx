import React, { useCallback, useEffect, useState, useMemo } from "react";
import { BarChart3, FileSpreadsheet, Target } from "lucide-react";
import { TranslationSet } from "../../../translations";
import { apiFetchJson, ApiError } from "../../../utils/api";
import { mapRawShotToDisplay } from "../../../utils/shotCoordinates";
import type { DisplayShot, Shooter } from "../../../types";
import type {
  ShooterReportPayload,
  DateRangePreset,
} from "../../../types/reports";
import { presetToRange } from "../../../types/reports";
import { ReportFilters } from "./reports/ReportFilters";
import { ReportMetricCards } from "./reports/ReportMetricCards";
import { ScoreTrendChart } from "./reports/ScoreTrendChart";
import { RingDistributionChart } from "./reports/RingDistributionChart";
// import { SessionHistoryTable } from "./reports/SessionHistoryTable";
import { DayTargetPanel } from "./reports/DayTargetPanel";

type ReportsPanel = "analytics" | "placement";

interface ReportsViewProps {
  isDarkMode: boolean;
  profileType: "FIGURE" | "CIRCULAR";
  setProfileType: (val: "FIGURE" | "CIRCULAR") => void;
  language: "en" | "ar";
  t: TranslationSet;
  triggerSuccessBanner: (msg: string) => void;
  availableShooters: Shooter[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  isDarkMode,
  profileType,
  setProfileType,
  language,
  triggerSuccessBanner,
  availableShooters,
}) => {
  const isAr = language === "ar";
  const defaultRange = presetToRange("30d");

  const [selectedShooter, setSelectedShooter] = useState(
    availableShooters[0]?.name ?? "",
  );
  const [rangePreset, setRangePreset] = useState<DateRangePreset>("30d");
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [activePanel, setActivePanel] = useState<ReportsPanel>("analytics");

  const [report, setReport] = useState<ShooterReportPayload | null>(null);
  const [rangeShots, setRangeShots] = useState<DisplayShot[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingShots, setLoadingShots] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (rangePreset !== "custom") {
      const range = presetToRange(rangePreset);
      setFromDate(range.from);
      setToDate(range.to);
    }
  }, [rangePreset]);

  useEffect(() => {
    if (
      availableShooters.length > 0 &&
      !availableShooters.some((s) => s.name === selectedShooter)
    ) {
      setSelectedShooter(availableShooters[0]!.name);
    }
  }, [availableShooters, selectedShooter]);

  const fetchReport = useCallback(async () => {
    if (!selectedShooter) return;
    setLoadingReport(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const data: ShooterReportPayload = await apiFetchJson(
        `/api/reports/shooters/${encodeURIComponent(selectedShooter)}?${params}`,
      );
      setReport(data);
    } catch (err: unknown) {
      setReport(null);
      let message: string;
      if (err instanceof ApiError) {
        if (err.statusCode === 401) {
          message = isAr
            ? "انتهت الجلسة — سجّل الدخول مجدداً"
            : "Session expired — log in again";
        } else if (err.statusCode === 404) {
          message = isAr
            ? "واجهة التقارير غير متوفرة — أعد تشغيل الخادم"
            : "Reports API not found — restart the backend server";
        } else {
          message = err.message;
        }
      } else {
        message = err instanceof Error ? err.message : "Could not load shooter report.";
      }
      setFetchError(message);
      triggerSuccessBanner(message);
    } finally {
      setLoadingReport(false);
    }
  }, [selectedShooter, fromDate, toDate, isAr, triggerSuccessBanner]);

  const fetchRangeShots = useCallback(async () => {
    if (!selectedShooter) return;
    setLoadingShots(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const data = await apiFetchJson<{ shots: any[] }>(
        `/api/reports/shooters/${encodeURIComponent(selectedShooter)}/shots?${params}`,
      );
      const mapped: DisplayShot[] = data.shots
        .map(
          (
            sh: {
              id?: number;
              shotNumber: number;
              x: number;
              y: number;
              isMiss?: boolean;
              timestamp?: string;
            },
            index: number,
          ) => {
            const display = mapRawShotToDisplay(
              {
                shotNumber: sh.shotNumber,
                x: sh.x,
                y: sh.y,
                isMiss: sh.isMiss,
                timestamp: sh.timestamp,
              },
              index,
              1,
            );
            if (typeof sh.id === "number" && sh.id > 0) {
              display.id = sh.id;
            }
            return display;
          },
        )
        .sort((a: DisplayShot, b: DisplayShot) => a.id - b.id);
      setRangeShots(mapped);
    } catch {
      setRangeShots([]);
    } finally {
      setLoadingShots(false);
    }
  }, [selectedShooter, fromDate, toDate]);

  const completionRate = useMemo(() => {
    const sessions = report?.sessions ?? [];
    if (sessions.length === 0) return null;
    const completed = sessions.filter(
      (s) => s.status === "COMPLETED",
    ).length;
    return Math.round((completed / sessions.length) * 100);
  }, [report]);

  const highScoreRate = useMemo(() => {
    if (!report?.ringDistribution || !report?.summary?.totalShots) return null;

    const highHits =
      (report.ringDistribution["10"] ?? 0) +
      (report.ringDistribution["8-9"] ?? 0);

    return Math.round((highHits / report.summary.totalShots) * 100);
  }, [report]);

  const missRate = useMemo(() => {
    if (!report?.ringDistribution || !report?.summary?.totalShots) return null;

    const misses = report.ringDistribution.miss ?? 0;

    return Math.round((misses / report.summary.totalShots) * 100);
  }, [report]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    fetchRangeShots();
  }, [fetchRangeShots]);

  const panels: { id: ReportsPanel; icon: React.ReactNode; label: string }[] = [
    {
      id: "analytics",
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      label: isAr ? "التحليلات" : "Analytics",
    },
    {
      id: "placement",
      icon: <Target className="w-3.5 h-3.5" />,
      label: isAr ? "توزيع الإصابات" : "Bullet placement",
    },
  ];

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden max-w-7xl mx-auto">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-hud pb-2">
        <h2 className="hud-label hud-accent flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          {isAr ? "تحليلات الرامي" : "SHOOTER ANALYTICS"}
        </h2>
        <div className="hud-tab-well flex gap-0.5">
          {panels.map(({ id, icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePanel(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md admin-text-2xs font-mono font-bold transition-colors cursor-pointer ${
                activePanel === id ? "hud-tab--active" : "hud-tab--idle"
              }`}
            >
              {icon}
              {label}
              {id === "placement" && !loadingShots && rangeShots.length > 0 && (
                <span className="opacity-80">({rangeShots.length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {fetchError && (
        <div className="shrink-0 rounded-lg border px-4 py-2 admin-text-xs font-mono hud-alert-banner">
          {fetchError}
        </div>
      )}

      <div className="shrink-0">
        <ReportFilters
          shooters={
            availableShooters.length > 0
              ? availableShooters
              : [
                  {
                    id: "temp",
                    name: "shooter1",
                    rank: null,
                    badgeNumber: null,
                  },
                ]
          }
          selectedShooter={selectedShooter}
          onShooterChange={setSelectedShooter}
          rangePreset={rangePreset}
          onRangePresetChange={setRangePreset}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          isAr={isAr}
        />
      </div>

      {activePanel === "analytics" ? (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          <ReportMetricCards
            summary={report?.summary ?? null}
            loading={loadingReport}
            isAr={isAr}
            completionRate={completionRate}
            highScoreRate={highScoreRate}
            missRate={missRate}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-56 shrink-0">
            <ScoreTrendChart
              trend={report?.trend ?? []}
              isDarkMode={isDarkMode}
              isAr={isAr}
              className="h-full"
            />
            <RingDistributionChart
              ringDistribution={
                report?.ringDistribution ?? {
                  "10": 0,
                  "8-9": 0,
                  "6-7": 0,
                  "4-5": 0,
                  miss: 0,
                }
              }
              isDarkMode={isDarkMode}
              isAr={isAr}
              className="h-full"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <DayTargetPanel
            shots={rangeShots}
            shooterName={selectedShooter}
            fromDate={fromDate}
            toDate={toDate}
            profileType={profileType}
            setProfileType={setProfileType}
            isDarkMode={isDarkMode}
            language={language}
            loading={loadingShots}
            triggerSuccessBanner={triggerSuccessBanner}
            fullHeight
          />
        </div>
      )}
    </div>
  );
};
