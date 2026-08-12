import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
} from "lucide-react";
import type { ShooterSessionRow } from "../../../../types/reports";
import { formatDateISO } from "../../../../types/reports";
import type { DisplayShot } from "../../../../types";
import { apiFetchJson } from "../../../../utils/api";
import { downloadCsv } from "../../../../utils/csv";
import { mapRawShotToDisplay } from "../../../../utils/shotCoordinates";
import { targetProfileFromTargetId } from "../../../../utils/targetProfile";
import { SessionShotPreview } from "./SessionShotPreview";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

interface SessionHistoryTableProps {
  sessions: ShooterSessionRow[];
  loading: boolean;
  isAr: boolean;
  isDarkMode: boolean;
  profileType: "FIGURE" | "CIRCULAR";
  shooterName?: string;
  fromDate?: string;
  toDate?: string;
  fillHeight?: boolean;
}

function statusBadge(status: string): string {
  switch (status) {
    case "REVIEWED":
      return "hud-status-ready";
    case "COMPLETED":
      return "hud-status-active";
    case "CANCELLED":
      return "hud-danger border-[color-mix(in_srgb,var(--hud-danger)_40%,transparent)] bg-[var(--hud-danger-bg)]";
    default:
      return "hud-status-vacant";
  }
}

function formatSessionDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateISO(date);
}

function statusLabel(status: string, isAr: boolean): string {
  if (status === "CANCELLED") {
    return isAr ? "ملغاة" : "CANCELLED";
  }
  return status;
}

export const SessionHistoryTable: React.FC<SessionHistoryTableProps> = ({
  sessions,
  loading,
  isAr,
  isDarkMode,
  profileType,
  shooterName,
  fromDate,
  toDate,
  fillHeight = false,
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shotsBySession, setShotsBySession] = useState<
    Record<string, DisplayShot[]>
  >({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorBySession, setErrorBySession] = useState<Record<string, string>>(
    {},
  );
  const [previewProfileType, setPreviewProfileType] = useState<
    "FIGURE" | "CIRCULAR"
  >("FIGURE");

  const availableProfiles = useMemo(() => {
    const profiles = new Set<"FIGURE" | "CIRCULAR">();
    for (const s of sessions) {
      profiles.add(targetProfileFromTargetId(s.targetIds[0]));
    }
    return profiles;
  }, [sessions]);

  useEffect(() => {
    if (
      availableProfiles.size > 0 &&
      !availableProfiles.has(previewProfileType)
    ) {
      const fallback = availableProfiles.has("FIGURE") ? "FIGURE" : "CIRCULAR";
      setPreviewProfileType(fallback);
    }
  }, [availableProfiles, previewProfileType]);

  const filteredSessions = useMemo(
    () =>
      sessions.filter(
        (s) => targetProfileFromTargetId(s.targetIds[0]) === previewProfileType,
      ),
    [sessions, previewProfileType],
  );

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [filteredSessions, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedSessions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, page, pageSize]);

  const pageStart =
    filteredSessions.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, filteredSessions.length);

  const exportSessionsCsv = useCallback(() => {
    if (filteredSessions.length === 0) return;

    const headers = isAr
      ? ["التاريخ", "الحارة", "الطلقات", "المتوسط", "الأفضل", "الحالة"]
      : ["Date", "Lane", "Shots", "Avg", "Best", "Status"];

    const preamble: (string | number)[][] = [];
    if (shooterName) {
      preamble.push([isAr ? "الرامي" : "Shooter", shooterName]);
    }
    if (fromDate && toDate) {
      preamble.push([isAr ? "الفترة" : "Period", `${fromDate} — ${toDate}`]);
    }

    const rows = filteredSessions.map((s) => [
      formatSessionDate(s.createdAt),
      s.laneId,
      s.shotCount,
      Math.round(Number(s.avgScore)),
      s.bestScore,
      statusLabel(s.status, isAr),
    ]);

    const datePart =
      fromDate && toDate
        ? `${fromDate}_to_${toDate}`
        : formatDateISO(new Date());
    const shooterPart = shooterName ? `${shooterName}_` : "";
    downloadCsv(
      `${shooterPart}session-history_${datePart}.csv`,
      headers,
      rows,
      preamble,
    );
  }, [filteredSessions, isAr, shooterName, fromDate, toDate]);

  const loadSessionShots = useCallback(
    async (sessionId: string, shotCount: number) => {
      if (shotsBySession[sessionId]) return;

      if (shotCount === 0) {
        setShotsBySession((prev) => ({ ...prev, [sessionId]: [] }));
        return;
      }

      setLoadingId(sessionId);
      setErrorBySession((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });

      try {
        const data = await apiFetchJson<{ shots: any[] }>(
          `/api/reports/session/${encodeURIComponent(sessionId)}`,
        );
        const mapped: DisplayShot[] = (data.shots ?? [])
          .map(
            (sh: {
              shotNumber: number;
              x: number;
              y: number;
              sensorXmm?: number | null;
              sensorYmm?: number | null;
              isMiss?: boolean;
              isLost?: boolean;
              timestamp?: string;
              score?: number | string;
            }) => {
              const display = mapRawShotToDisplay({
                shotNumber: sh.shotNumber,
                x: sh.x,
                y: sh.y,
                sensorXmm: sh.sensorXmm ?? undefined,
                sensorYmm: sh.sensorYmm ?? undefined,
                isMiss: sh.isMiss,
                isLost: sh.isLost,
                timestamp: sh.timestamp,
              });
              const score = Number(sh.score);
              if (!Number.isNaN(score)) {
                display.score = sh.isMiss ? 0 : score;
              }
              return display;
            },
          )
          .sort((a: DisplayShot, b: DisplayShot) => a.id - b.id);
        setShotsBySession((prev) => ({ ...prev, [sessionId]: mapped }));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load shots";
        setErrorBySession((prev) => ({ ...prev, [sessionId]: message }));
      } finally {
        setLoadingId(null);
      }
    },
    [isAr, shotsBySession],
  );

  const toggleRow = (session: ShooterSessionRow) => {
    const canExpand = session.shotCount > 0 || session.status === "CANCELLED";

    if (!canExpand) return;

    if (expandedId === session.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(session.id);
    void loadSessionShots(session.id, session.shotCount);
  };

  return (
    <div
      className={`hud-glass rounded-lg overflow-hidden ${
        fillHeight ? "flex flex-col h-full min-h-0" : ""
      }`}
    >
      <div className="p-3 border-b border-hud flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div>
          <h3 className="hud-label hud-accent flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5" />
            {isAr ? "سجل الجلسات" : "Session history"}
          </h3>
          {!fillHeight && (
            <p className="admin-text-2xs font-mono hud-text-muted mt-1">
              {isAr
                ? "اضغط على صف لعرض توزيع الطلقات وإحداثياتها"
                : "Click a row to preview bullet placement and x/y coordinates"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={exportSessionsCsv}
          disabled={loading || filteredSessions.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg admin-text-2xs font-mono font-bold hud-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          {isAr ? "تصدير CSV" : "Export CSV"}
        </button>
        <div className="flex items-center gap-2">
          {availableProfiles.has("CIRCULAR") && (
            <button
              type="button"
              onClick={() => setPreviewProfileType("CIRCULAR")}
              className={`px-3 py-1 rounded admin-text-2xs font-mono ${
                previewProfileType === "CIRCULAR"
                  ? "hud-btn-primary"
                  : "hud-btn-secondary"
              }`}
            >
              {isAr ? "دائرة مركزية" : "Bullseye"}
            </button>
          )}

          {availableProfiles.has("FIGURE") && (
            <button
              type="button"
              onClick={() => setPreviewProfileType("FIGURE")}
              className={`px-3 py-1 rounded admin-text-2xs font-mono ${
                previewProfileType === "FIGURE"
                  ? "hud-btn-primary"
                  : "hud-btn-secondary"
              }`}
            >
              {isAr ? "شكل بشري" : "Silhouette"}
            </button>
          )}
        </div>
      </div>
      <div
        className={
          fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-x-auto"
        }
      >
        <table className="w-full text-left font-mono admin-text-xs">
          <thead>
            <tr className="bg-hud-elevated hud-label hud-text-subtle">
              <th className="p-3 w-8" />
              <th className="p-3">{isAr ? "التاريخ" : "Date"}</th>
              <th className="p-3">{isAr ? "الحارة" : "Lane"}</th>
              <th className="p-3">{isAr ? "الطلقات" : "Shots"}</th>
              <th className="p-3">{isAr ? "المتوسط" : "Avg"}</th>
              <th className="p-3">{isAr ? "الأفضل" : "Best"}</th>
              <th className="p-3">{isAr ? "الحالة" : "Status"}</th>
            </tr>
          </thead>
          <tbody className="hud-text-secondary">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center hud-text-muted">
                  {isAr ? "جاري التحميل…" : "Loading…"}
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center hud-text-muted">
                  {isAr
                    ? "لا توجد جلسات في هذه الفترة"
                    : "No sessions in this range"}
                </td>
              </tr>
            ) : (
              paginatedSessions.map((s) => {
                const isExpanded = expandedId === s.id;
                const canExpand = s.shotCount > 0 || s.status === "CANCELLED";

                return (
                  <React.Fragment key={s.id}>
                    <tr
                      onClick={() => toggleRow(s)}
                      className={`border-t border-hud ${
                        canExpand
                          ? "cursor-pointer hover:bg-[var(--hud-accent-bg-subtle)]"
                          : "opacity-70"
                      } ${isExpanded ? "bg-[var(--hud-accent-bg-subtle)]" : ""}`}
                    >
                      <td className="p-3 hud-text-subtle">
                        {canExpand ? (
                          isExpanded ? (
                            <ChevronDown className="w-4 h-4 hud-accent" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )
                        ) : null}
                      </td>
                      <td className="p-3 hud-text">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        {isAr ? "حارة" : "Lane"} {s.laneId}
                      </td>
                      <td className="p-3 tabular-nums">{s.shotCount}</td>
                      <td className="p-3 tabular-nums hud-accent">
                        {Math.round(Number(s.avgScore))}
                      </td>
                      <td className="p-3 tabular-nums">{s.bestScore}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded admin-text-2xs font-bold uppercase border ${statusBadge(s.status)}`}
                        >
                          {statusLabel(s.status, isAr)}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-hud">
                        <td colSpan={7} className="p-3">
                          <SessionShotPreview
                            session={s}
                            shots={shotsBySession[s.id] ?? []}
                            loading={loadingId === s.id}
                            error={errorBySession[s.id] ?? null}
                            isDarkMode={isDarkMode}
                            profileType={previewProfileType}
                            isAr={isAr}
                            language={isAr ? "ar" : "en"}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && filteredSessions.length > 0 && (
        <div className="p-3 border-t border-hud flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="admin-text-2xs font-mono hud-text-muted">
            {isAr
              ? `${pageStart}–${pageEnd} من ${filteredSessions.length}`
              : `${pageStart}–${pageEnd} of ${filteredSessions.length}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 admin-text-2xs font-mono hud-text-muted">
              <span>{isAr ? "لكل صفحة" : "Per page"}</span>
              <select
                value={pageSize}
                onChange={(e) =>
                  setPageSize(
                    Number(
                      e.target.value,
                    ) as (typeof PAGE_SIZE_OPTIONS)[number],
                  )
                }
                className="hud-form-input rounded px-2 py-1 admin-text-2xs font-mono"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded hud-btn-secondary admin-text-2xs font-mono font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {isAr ? "السابق" : "Prev"}
            </button>
            <span className="admin-text-2xs font-mono hud-text-muted min-w-[4.5rem] text-center">
              {isAr
                ? `صفحة ${page} / ${totalPages}`
                : `Page ${page} / ${totalPages}`}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded hud-btn-secondary admin-text-2xs font-mono font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isAr ? "التالي" : "Next"}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
