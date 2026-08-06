import React, { useCallback, useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { apiFetchJson, ApiError } from "../../../utils/api";
import type {
  ShooterReportPayload,
  DateRangePreset,
} from "../../../types/reports";
import { presetToRange } from "../../../types/reports";
import { ReportFilters } from "./reports/ReportFilters";
import { SessionHistoryTable } from "./reports/SessionHistoryTable";
import { Shooter } from "@/src/types";

interface SessionHistoryViewProps {
  isDarkMode: boolean;
  profileType: "FIGURE" | "CIRCULAR";
  language: "en" | "ar";
  triggerSuccessBanner: (msg: string) => void;
  availableShooters: Shooter[];
}

export const SessionHistoryView: React.FC<SessionHistoryViewProps> = ({
  isDarkMode,
  profileType,
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

  const [report, setReport] = useState<ShooterReportPayload | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
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

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-hud pb-2">
        <h2 className="hud-label hud-accent flex items-center gap-2">
          <Crosshair className="w-4 h-4" />
          {isAr ? "سجل الجلسات" : "SESSION HISTORY"}
        </h2>
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

      <div className="flex-1 min-h-0">
        <SessionHistoryTable
          sessions={report?.sessions ?? []}
          loading={loadingReport}
          isAr={isAr}
          isDarkMode={isDarkMode}
          profileType={profileType}
          shooterName={selectedShooter}
          fromDate={fromDate}
          toDate={toDate}
          fillHeight
        />
      </div>
    </div>
  );
};
