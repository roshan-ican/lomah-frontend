import React from "react";
import type { ActiveShooterChannel } from "../../../types";
import type { TranslationSet } from "../../../translations";
import { useSessionStore } from "../../../store/sessionStore";
import { ShotHistory } from "./ShotHistory";
import { SessionTimer } from "./SessionTimer";

// ==========================================
// TYPES & INTERFACES
// ==========================================

interface ShooterSideRailProps {
  channel: ActiveShooterChannel;
  language: "en" | "ar";
  t: TranslationSet;
  selectedShotId: number | null;
  setSelectedShotId: (id: number | null) => void;
}

// ==========================================
// COMPONENT: ShooterSideRail
// ==========================================

export const ShooterSideRail: React.FC<ShooterSideRailProps> = ({
  channel,
  language,
  t,
  selectedShotId,
  setSelectedShotId,
}) => {
  const isAr = language === "ar";

  const storeChannel = useSessionStore((s) =>
    s.channels.find((ch) => ch.id === channel.id),
  );
  const active = storeChannel ?? channel;

  // Markers are dividers, not bullets: they must never add score or count as a
  // shot. They MUST still reach the shot log though — passing this filtered
  // array to ShotHistory (as this did) stripped the "Calibration Applied"
  // divider before it could ever render, so the marker silently never appeared.
  const shots = active.shots.filter((s) => !s.isCalibrationMarker);
  const status = active.sessionStatus;
  const isLive = status === "ACTIVE";

  const totalScore = shots.reduce((sum, s) => sum + s.score, 0);
  const roundsValue =
    active.bulletLimit && active.bulletLimit > 0
      ? `${shots.length}/${active.bulletLimit}`
      : String(shots.length);

  return (
    <aside className="shooter-rail range-layout-rail bg-hud-rail">
      <div className="shrink-0 grid grid-cols-3 gap-1 px-2 py-2.5 border-b border-hud bg-[var(--hud-elevated)]">
        <div className="text-center min-w-0 px-1">
          <SessionTimer
            startTime={active.startTime}
            endTime={active.endTime}
            durationSeconds={active.durationSeconds}
            totalPausedMs={active.totalPausedMs}
            remainingSeconds={active.remainingSeconds}
            sessionStatus={active.sessionStatus}
            language={language}
            variant="rail"
          />
          <span className="range-display-label block mt-1 opacity-90">
            {isAr ? "الوقت" : "Time"}
          </span>
        </div>
        <div className="text-center min-w-0 px-1 border-x border-hud">
          <span className="range-display-stat hud-accent block leading-none">
            {totalScore}
          </span>
          <span className="range-display-label block mt-1 opacity-90">
            {t.totalScore}
          </span>
        </div>
        <div className="text-center min-w-0 px-1">
          <span className="range-display-stat block leading-none">
            {roundsValue}
          </span>
          <span className="range-display-label block mt-1 opacity-90">
            {isAr ? "الطلقات" : "Shots"}
          </span>
        </div>
      </div>

      {isLive && (
        <div className="rail-live-banner shrink-0 items-center justify-center gap-2 py-1.5 border-b border-hud bg-[color-mix(in_srgb,var(--hud-success)_8%,transparent)]">
          <span className="w-2 h-2 rounded-full bg-[var(--hud-success)] animate-pulse" />
          <span className="range-display-label hud-success tracking-[0.2em]">
            {isAr ? "مباشر" : "Live"}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-1 pb-1 pt-2">
        <div className="shrink-0 text-center pb-2 border-b border-hud mb-1 bg-border-2">
          <span className="range-display-label text-sm tracking-[0.22em] hud-text-strong">
            {t.shotLog}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ShotHistory
            shots={active.shots}
            selectedShotId={selectedShotId}
            setSelectedShotId={setSelectedShotId}
            language={language}
            t={t}
            variant="hud"
            layout="vertical"
            hideHeader
          />
        </div>
      </div>
    </aside>
  );
};
