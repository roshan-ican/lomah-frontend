import React, { useRef, useState } from "react";
import { Target, Plus, Minus, RotateCcw } from "lucide-react";
import { TargetView } from "../../../shooter/components/TargetView";
import type { DisplayShot, ActiveShooterChannel } from "../../../../types";

function clampZoom(value: number): number {
  return Math.max(0.1, Math.min(5, value));
}

interface DayTargetPanelProps {
  shots: DisplayShot[];
  shooterName: string;
  fromDate: string;
  toDate: string;
  profileType: "FIGURE" | "CIRCULAR";
  setProfileType: (val: "FIGURE" | "CIRCULAR") => void;
  isDarkMode: boolean;
  language: "en" | "ar";
  loading: boolean;
  triggerSuccessBanner: (msg: string) => void;
  fullHeight?: boolean;
}

export const DayTargetPanel: React.FC<DayTargetPanelProps> = ({
  shots,
  shooterName,
  fromDate,
  toDate,
  profileType,
  setProfileType,
  isDarkMode,
  language,
  loading,
  triggerSuccessBanner,
  fullHeight = false,
}) => {
  const isAr = language === "ar";
  const targetContainerRef = useRef<HTMLDivElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} — ${toDate}`;

  const changeZoom = (delta: number) =>
    setZoomLevel((z) => clampZoom(z + delta));
  const resetZoom = () => setZoomLevel(1);

  const channel: ActiveShooterChannel = {
    id: "REPORT",
    name: shooterName,
    opId: shooterName,
    unit: "—",
    sessionStatus: "COMPLETED",
    shots,
    distance: "—",
    targetName: rangeLabel,
  };

  return (
    <div
      className={`hud-glass rounded-lg flex flex-col min-h-0 ${
        fullHeight ? "h-full p-3" : "p-4"
      }`}
    >
      <div className="flex items-center justify-between mb-2 border-b border-hud pb-2 shrink-0">
        <h3 className="hud-label hud-accent flex items-center gap-2">
          <Target className="w-4 h-4" />
          {isAr ? "توزيع الإصابات" : "Bullet placement"}
          {" · "}
          {rangeLabel}
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" dir="ltr">
            <button
              type="button"
              onClick={() => changeZoom(-0.25)}
              className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={isAr ? "تصغير" : "Zoom out"}
              title={isAr ? "تصغير" : "Zoom out"}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="admin-text-sm font-mono text-emerald-400 min-w-[2.5rem] text-center">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => changeZoom(0.25)}
              className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={isAr ? "تكبير" : "Zoom in"}
              title={isAr ? "تكبير" : "Zoom in"}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={isAr ? "إعادة ضبط التكبير" : "Reset zoom"}
              title={isAr ? "إعادة ضبط التكبير" : "Reset zoom"}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="hud-label hud-text-subtle">
            {loading ? "…" : shots.length} {isAr ? "طلقة" : "shots"}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="admin-text-xs hud-text-muted font-mono text-center flex-1 flex items-center justify-center">
          {isAr ? "جاري التحميل…" : "Loading target data…"}
        </p>
      ) : shots.length === 0 ? (
        <p className="admin-text-xs hud-text-muted font-mono text-center flex-1 flex items-center justify-center">
          {isAr
            ? "لا توجد طلقات في هذه الفترة"
            : "No shots recorded in this period"}
        </p>
      ) : (
        <div
          className="flex-1 min-h-0 flex flex-col"
          onWheel={(e) => {
            e.preventDefault();
            changeZoom(e.deltaY < 0 ? 0.15 : -0.15);
          }}
          onDoubleClick={resetZoom}
        >
          <TargetView
            activeChannel={channel}
            profileType={profileType}
            setProfileType={setProfileType}
            // showGrid={false}
            // setShowGrid={() => {}}
            zoomLevel={zoomLevel}
            changeZoom={changeZoom}
            isDarkMode={isDarkMode}
            selectedShotId={null}
            setSelectedShotId={() => {}}
            targetContainerRef={targetContainerRef}
            triggerSuccessBanner={triggerSuccessBanner}
            language={language}
            readOnly
            variant="hud"
            size={fullHeight ? "fill" : "default"}
            embedded={fullHeight}
            compact={fullHeight}
            hideHudStatus
          />
        </div>
      )}
    </div>
  );
};
