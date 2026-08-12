import React, { useRef, useState } from "react";
import { Crosshair, ListOrdered, Minus, Plus, RotateCcw } from "lucide-react";
import { TargetView } from "../../../shooter/components/TargetView";
// import { ShotDirectionArrow } from "../../../shooter/components/ShotDirectionArrow";
import type { DisplayShot, ActiveShooterChannel } from "../../../../types";
import type { ShooterSessionRow } from "../../../../types/reports";
import { ShotDirectionArrow } from "@/src/modules/shooter/components/ShotDirectionArrow";
// import ShotDirectionArrow from "@/src/modules/shooter/components/ShotDirectionArrow";

interface SessionShotPreviewProps {
  session: ShooterSessionRow;
  /** The report is already scoped to one shooter, so the name comes from the
   *  parent rather than being repeated on every session row. */
  shooterName?: string;
  shots: DisplayShot[];
  loading: boolean;
  error: string | null;
  isDarkMode: boolean;
  profileType: "FIGURE" | "CIRCULAR";
  isAr: boolean;
  language: "en" | "ar";
}

function shotScore(sh: DisplayShot): number {
  return Number(sh.score) || 0;
}

function clampZoom(value: number): number {
  return Math.max(0.1, Math.min(5, value));
}

export const SessionShotPreview: React.FC<SessionShotPreviewProps> = ({
  session,
  shooterName,
  shots,
  loading,
  error,
  isDarkMode,
  profileType,
  isAr,
  language,
}) => {
  const targetContainerRef = useRef<HTMLDivElement | null>(null);
  const lastTargetTapRef = useRef(0);
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  if (loading) {
    return (
      <p className="admin-text-xs hud-text-muted font-mono py-4 text-center">
        {isAr ? "جاري تحميل توزيع الطلقات…" : "Loading shot placement…"}
      </p>
    );
  }

  if (error) {
    return (
      <p className="admin-text-xs hud-danger font-mono py-4 text-center">{error}</p>
    );
  }

  if (shots.length === 0) {
    return (
      <p className="admin-text-xs hud-text-muted font-mono py-4 text-center">
        {session.status === "CANCELLED"
          ? isAr
            ? "جلسة ملغاة — لا توجد طلقات مسجّلة"
            : "Cancelled session — no shots recorded"
          : isAr
            ? "لا توجد طلقات مسجّلة لهذه الجلسة"
            : "No shots recorded for this session"}
      </p>
    );
  }

  const channel: ActiveShooterChannel = {
    id: `PREVIEW-${session.id}`,
    name: shooterName ?? "—",
    opId: shooterName ?? "—",
    unit: "—",
    sessionStatus: session.status as ActiveShooterChannel["sessionStatus"],
    shots,
    distance: "—",
    targetName: `Session ${new Date(session.createdAt).toLocaleDateString()}`,
  };

  return (
    <div className="space-y-3 p-4 hud-analysis-glow rounded-lg">
      <div className="flex flex-wrap gap-2 admin-text-2xs font-mono">
        <span className="px-2.5 py-1 rounded-md hud-status-active border">
          {isAr ? "المتوسط" : "Avg"}: {Math.round(Number(session.avgScore))}
        </span>
        <span className="px-2.5 py-1 rounded-md border border-hud hud-text-secondary">
          {shots.length} {isAr ? "طلقة" : "shots"}
        </span>
        <span className="px-2.5 py-1 rounded-md border border-hud hud-accent">
          {isAr ? "أفضل" : "Best"}: {Math.round(Number(session.bestScore))}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 lg:gap-4 h-[550px]">
        <div className="rounded-lg border border-hud overflow-hidden flex flex-col h-full bg-hud-elevated">
          <div className="px-3 py-2.5 border-b border-hud hud-label hud-accent flex items-center gap-2 shrink-0">
            <Crosshair className="w-3.5 h-3.5" />
            {isAr ? "لوحة الهدف" : "Target board"}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-hud shrink-0">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => clampZoom(z - 0.25))}
              className="hud-btn-secondary p-1.5"
              aria-label={isAr ? "تصغير الهدف" : "Zoom out"}
              title={isAr ? "تصغير الهدف" : "Zoom out"}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-12 text-center admin-text-xs font-mono hud-text-secondary">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => clampZoom(z + 0.25))}
              className="hud-btn-secondary p-1.5"
              aria-label={isAr ? "تكبير الهدف" : "Zoom in"}
              title={isAr ? "تكبير الهدف" : "Zoom in"}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="hud-btn-secondary p-1.5"
              aria-label={isAr ? "إعادة ضبط التكبير" : "Reset zoom"}
              title={isAr ? "إعادة ضبط التكبير" : "Reset zoom"}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div
            className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-2"
            onWheel={(e) => {
              e.preventDefault();

              setZoomLevel((z) => clampZoom(z + (e.deltaY < 0 ? 0.15 : -0.15)));
            }}
            onDoubleClick={() => setZoomLevel(1)}
            onPointerUp={() => {
              const now = Date.now();
              if (now - lastTargetTapRef.current < 300) {
                setZoomLevel(1);
              }
              lastTargetTapRef.current = now;
            }}
          >
            <TargetView
              activeChannel={channel}
              profileType={profileType}
              setProfileType={() => {}}
              // showGrid={false}
              // setShowGrid={() => {}}
              zoomLevel={zoomLevel}
              changeZoom={(delta) => setZoomLevel((z) => clampZoom(z + delta))}
              isDarkMode={isDarkMode}
              selectedShotId={selectedShotId}
              setSelectedShotId={setSelectedShotId}
              targetContainerRef={targetContainerRef}
              triggerSuccessBanner={() => {}}
              language={language}
              compact
              readOnly
            />
          </div>
        </div>

        <div className="rounded-lg border border-hud overflow-hidden flex flex-col h-full bg-hud-elevated">
          <div className="px-3 py-2.5 border-b border-hud hud-label hud-accent flex items-center gap-2 shrink-0">
            <ListOrdered className="w-3.5 h-3.5" />
            {isAr ? "بيانات الطلقات" : "Shot data"}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-left font-mono admin-text-2xs">
              <thead className="sticky top-0 z-10 bg-hud-elevated hud-label hud-text-subtle">
                <tr>
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">{isAr ? "الاتجاه" : "Dir"}</th>
                  <th className="px-3 py-2.5">
                    {isAr ? "الموضع" : "Position"}
                  </th>
                  <th className="px-3 py-2.5">{isAr ? "النقاط" : "Score"}</th>
                </tr>
              </thead>
              <tbody className="hud-text-secondary">
                {shots.map((sh) => {
                  const score = shotScore(sh);
                  return (
                    <tr
                      key={sh.id}
                      // Second tap clears it, same as the live shot log — this
                      // table drives the same highlight on the plot beside it.
                      onClick={() => {
                        setSelectedShotId(selectedShotId === sh.id ? null : sh.id);
                      }}
                      className={`border-t border-hud cursor-pointer hover:bg-[var(--hud-accent-bg-subtle)]
    ${selectedShotId === sh.id ? "bg-[var(--hud-accent-bg-subtle)]" : ""}
  `}
                    >
                      <td className="px-3 py-2">{sh.id}</td>
                      <td className="px-3 py-2">
                        <ShotDirectionArrow
                          x={sh.x}
                          y={sh.y}
                          size={32}
                          language={language}
                        />
                      </td>
                      {/* Scored position, then the board's own reading when a
                          calibration moved this shot. Once a session is closed
                          the offset that produced x/y can no longer be read off
                          the live header, so the pair is the only thing that
                          still explains the difference. */}
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        <span className="hud-text-secondary">
                          <span className="font-bold">X:</span>
                          {sh.x}mm <span className="font-bold">Y:</span>
                          {sh.y}mm
                        </span>
                        {sh.sensorX != null &&
                          sh.sensorY != null &&
                          (sh.sensorX !== sh.x || sh.sensorY !== sh.y) && (
                            <span className="hud-text-subtle ml-2">
                              <span className="font-bold">
                                {isAr ? "مستشعر" : "SENSOR"}
                              </span>{" "}
                              {sh.sensorX}, {sh.sensorY}
                            </span>
                          )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            score >= 8
                              ? "hud-success"
                              : score === 0
                                ? "hud-text-subtle"
                                : "hud-warning"
                          }
                        >
                          {Math.round(score)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
