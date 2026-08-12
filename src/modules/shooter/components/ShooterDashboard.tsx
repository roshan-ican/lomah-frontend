import React, { useEffect, useState } from "react";

import { TargetView } from "./TargetView";

import { ShooterSideRail } from "./ShooterSideRail";

import { LanguageSwitcher } from "../../../components/common/LanguageSwitcher";

import { ThemeSwitcher } from "../../../components/common/ThemeSwitcher";

import { MobileRangeTabBar } from "../../../components/common/MobileRangeTabBar";

import { useMobilePortrait } from "../../../hooks/useMobilePortrait";

import { targetProfileFromTargetId } from "../../../utils/targetProfile";

import { translations, TranslationSet } from "../../../translations";

import type { ActiveShooterChannel as ActiveChannel } from "../../../types";
import { Crosshair, User } from "lucide-react";
import { CLICK_TO_FIRE_ENABLED } from "../../../utils/featureFlags";
interface ShooterDashboardProps {
  activeChannel: ActiveChannel;

  assignedLaneId: number | null;

  loggedInShooter?: string;

  isDarkMode: boolean;

  setIsDarkMode: (val: boolean) => void;

  language: "en" | "ar";

  setLanguage: (lang: "en" | "ar") => void;

  zoomLevel: number;

  changeZoom: (factor: number) => void;

  showGrid: boolean;

  setShowGrid: (val: boolean) => void;

  selectedShotId: number | null;

  setSelectedShotId: (val: number | null) => void;

  targetContainerRef: React.RefObject<HTMLDivElement | null>;
  targetSvgRef: React.RefObject<SVGSVGElement | null>;
  handleTargetClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSimulateShot?: () => void;
  isSimulatingShot?: boolean;

  triggerSuccessBanner: (msg: string) => void;
}

export const ShooterDashboard: React.FC<ShooterDashboardProps> = ({
  activeChannel,

  assignedLaneId,

  isDarkMode,

  setIsDarkMode,
  loggedInShooter,
  language,

  setLanguage,

  selectedShotId,

  setSelectedShotId,

  zoomLevel,
  changeZoom,

  targetContainerRef,
  targetSvgRef,
  handleTargetClick,
  onSimulateShot,
  isSimulatingShot = false,

  triggerSuccessBanner,
}) => {
  const t: TranslationSet = translations[language];

  // ── ADD THIS HOOK FOR AUTO HOT-SWAPPING ────────────────────────────────────
  // When the backend changes the shooter, instantly clear frontend selections
  // and flash a success banner notifying the new shooter.
  useEffect(() => {
    setSelectedShotId(null);
    if (loggedInShooter) {
      triggerSuccessBanner(
        language === "ar"
          ? `تم تبديل الرامي إلى: ${loggedInShooter}`
          : `Active Shooter: ${loggedInShooter}`,
      );
    }
  }, [loggedInShooter, setSelectedShotId, language]);
  // ───────────────────────────────────────────────────────────────────
  const laneNumber =
    activeChannel.id?.startsWith("CH-") && activeChannel.id !== "CH-UNASSIGNED"
      ? activeChannel.id.replace("CH-", "")
      : null;
  const isAr = language === "ar";

  const isMobilePortrait = useMobilePortrait();

  const [mobilePane, setMobilePane] = useState<"main" | "rail">("main");

  const canShoot =
    assignedLaneId != null && activeChannel.sessionStatus === "ACTIVE";

  const isLive = activeChannel.sessionStatus === "ACTIVE";

  const showWaitHint = !canShoot;

  const sessionProfile = targetProfileFromTargetId(activeChannel.targetName);
  const realShots = activeChannel.shots.filter((s) => !s.isCalibrationMarker);
  const totalShots = realShots.length;

  const roundsText =
    activeChannel.bulletLimit && activeChannel.bulletLimit > 0
      ? `${totalShots}/${activeChannel.bulletLimit}`
      : `${totalShots}`;

  const totalScore = realShots.reduce((sum, shot) => sum + shot.score, 0);

  return (
    <div className="h-dvh-screen overflow-hidden flex flex-col bg-hud-page hud-text">
      <header className="fixed top-0 left-0 right-0 range-app-header safe-area-inset-x border-b border-hud flex justify-end items-center z-40 bg-hud-rail">
        {isLive && (
          <div className="mr-auto flex items-center gap-2 pl-1">
            <span className="w-2 h-2 rounded-full bg-[var(--hud-success)] animate-pulse" />

            <span className="range-display-label hud-success text-[0.6rem] sm:text-xs tracking-[0.2em]">
              {isAr ? "مباشر" : "Live"}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {loggedInShooter && (
            <div className="touch-target px-2.5 rounded text-xs sm:text-xs font-mono font-bold inline-flex items-center justify-center gap-1.5 border transition-all border-gray-200 dark:border-glass-border bg-gray-50 dark:bg-[#1C1F26] text-gray-700 dark:text-[#bccac1]">
              <User className="w-3.5 h-3.5 text-emerald-500" />
              <span>{loggedInShooter}</span>
              {laneNumber && (
                <>
                  <span className="opacity-50">|</span>
                  <span className="text-emerald-500">Lane {laneNumber}</span>
                </>
              )}
            </div>
          )}

          {/* Hidden while CLICK_TO_FIRE_ENABLED is off — this posts the same
              /debug/simulate-shot a board tap used to, so it forges a real
              round in the log too. */}
          {CLICK_TO_FIRE_ENABLED && canShoot && onSimulateShot && (
            <button
              type="button"
              onClick={onSimulateShot}
              disabled={isSimulatingShot}
              className="touch-target inline-flex items-center justify-center rounded text-xs font-mono font-bold text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 disabled:opacity-45 disabled:cursor-wait cursor-pointer gap-1"
              title={isAr ? "إرسال طلقة اختبار" : "Send simulated shot"}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isAr ? "اختبار" : "Test Shot"}
              </span>
            </button>
          )}

          <LanguageSwitcher language={language} setLanguage={setLanguage} />

          <ThemeSwitcher
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 range-app-body-offset flex flex-col overflow-hidden safe-area-bottom">
        <div
          className={`flex-1 min-h-0 range-layout-inner range-layout-inner--pane ${
            isMobilePortrait && mobilePane === "rail"
              ? "range-layout-show-rail"
              : ""
          }`}
        >
          <div className="range-layout-target flex flex-col min-h-0 px-0.5 sm:px-2 py-0.5 bg-hud-target-stage">
            <div className="mx-2 mb-2 rounded-xl border border-hud bg-hud-rail px-3 py-4 sm:px-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4 text-center">
                <div>
                  <div className="text-sm sm:text-base opacity-80 uppercase tracking-wide">
                    Lane
                  </div>
                  <div className="font-bold text-2xl sm:text-3xl leading-tight">
                    {laneNumber ?? "-"}
                  </div>
                </div>

                <div>
                  <div className="text-sm sm:text-base opacity-80 uppercase tracking-wide">
                    Shooter
                  </div>
                  <div className="font-bold text-2xl sm:text-3xl leading-tight truncate">
                    {loggedInShooter ?? "Unassigned"}
                  </div>
                </div>

                <div>
                  <div className="text-sm sm:text-base opacity-80 uppercase tracking-wide">
                    Shots
                  </div>
                  <div className="font-bold text-2xl sm:text-3xl leading-tight">
                    {roundsText}
                  </div>
                </div>

                <div>
                  <div className="text-sm sm:text-base opacity-80 uppercase tracking-wide">
                    Score
                  </div>
                  <div className="font-bold text-2xl sm:text-3xl leading-tight text-emerald-500">
                    {totalScore}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 target-stage overflow-hidden">
              <div className="target-fit-box h-full">
                <TargetView
                  key={`${activeChannel.id}-${sessionProfile}`}
                  activeChannel={activeChannel}
                  profileType={sessionProfile}
                  setProfileType={() => {}}
                  zoomLevel={zoomLevel}
                  changeZoom={changeZoom}
                  isDarkMode={isDarkMode}
                  selectedShotId={selectedShotId}
                  setSelectedShotId={setSelectedShotId}
                  targetContainerRef={targetContainerRef}
                  targetSvgRef={targetSvgRef}
                  handleTargetClick={canShoot ? handleTargetClick : undefined}
                  triggerSuccessBanner={triggerSuccessBanner}
                  language={language}
                  variant="hud"
                  size="fill"
                  embedded
                  hideHudStatus
                  distance={activeChannel.distance}
                />
              </div>
            </div>

            {showWaitHint && (
              <p className="shrink-0 py-1.5 text-center range-display-label text-[0.65rem] sm:text-xs hud-text-secondary normal-case tracking-wide px-2">
                {assignedLaneId == null
                  ? isAr
                    ? "بانتظار تعيين الحارة"
                    : "Awaiting lane assignment"
                  : isAr
                    ? "بانتظار بدء الجلسة"
                    : "Awaiting session start"}
              </p>
            )}
          </div>

          <ShooterSideRail
            channel={activeChannel}
            language={language}
            t={t}
            selectedShotId={selectedShotId}
            setSelectedShotId={setSelectedShotId}
          />
        </div>

        {isMobilePortrait && (
          <MobileRangeTabBar
            tabs={[
              { id: "main", label: isAr ? "الهدف" : "Target" },

              { id: "rail", label: isAr ? "الطلقات" : "Shots" },
            ]}
            active={mobilePane}
            onChange={(id) => setMobilePane(id as "main" | "rail")}
          />
        )}
      </div>
    </div>
  );
};
