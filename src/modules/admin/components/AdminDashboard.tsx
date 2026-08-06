/// <reference types="react" />
import React, { useEffect, useState } from "react";
import { SessionHistoryView } from "./SessionHistoryView";
import { ActivityLog } from "./ActivityLog";
import { LaneWorkspace } from "./LaneWorkspace";
import { ReportsView } from "./ReportsView";
import { AdminHelp } from "./AdminHelp";
import { translations, TranslationSet } from "../../../translations";
import { shotsForLaneDisplay } from "../../../utils/laneSession";
import { targetProfileFromTargetId } from "../../../utils/targetProfile";
import type { AdminDashboardProps, AdminTab } from "./admin-dashboard/types";
import { useSensorGate } from "./admin-dashboard/useSensorGate";
import { useLaneFocus } from "./admin-dashboard/useLaneFocus";
import { useResponsiveNav } from "./admin-dashboard/useResponsiveNav";
import { AdminHeader } from "./admin-dashboard/AdminHeader";
import { AdminSidebar } from "./admin-dashboard/AdminSidebar";
import { ShooterDevicesTab } from "./admin-dashboard/ShooterDevicesTab";
import { LaneHardwarePanel } from "./admin-dashboard/LaneHardwarePanel";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  channels,
  selectedChannelId,
  setSelectedChannelId,
  handleAdminCommand,
  onCreateSession,
  onPauseSession,
  onResumeSession,
  onEndSession,
  onAdvanceSession,
  onDiscardSession,
  onSaveFeedback,
  onCancelSession,
  onStartAllSessions,
  onPauseAllSessions,
  isDarkMode,
  setIsDarkMode,
  language,
  setLanguage,
  adminLogs,
  triggerSuccessBanner,
  handleLogout,
  onDiscardReadySession,
  zoomLevel,
  changeZoom,
  showGrid,
  setShowGrid,
  profileType,
  setProfileType,
  selectedShotId,
  setSelectedShotId,
  targetContainerRef,
  calibrateMode,
  setCalibrateMode,
  onLaneCalibrate,
  onShotsCalibrate,
  availableShooters,
  calibrationLaneId,
  setCalibrationLaneId,
  onCalibrationDismiss,
  onSetOffset,
  onRefreshShooters,
}: AdminDashboardProps) => {
  const t: TranslationSet = translations[language];
  const isAr = language === "ar";

  const [activeTab, setActiveTab] = useState<AdminTab>("CONTROL");
  const { navOpen, setNavOpen, selectTab } = useResponsiveNav(setActiveTab);
  const { sensorGate, setSensorHold } = useSensorGate({
    isAr,
    triggerSuccessBanner,
  });
  const {
    laneFocused,
    controlPanelOpen,
    setControlPanelOpen,
    liveBoardMode,
    handleSelectLane,
    focusLane,
    showAllLanes,
    toggleLiveBoardMode,
  } = useLaneFocus({
    setSelectedChannelId,
    setSelectedShotId,
    setCalibrateMode,
  });

  const activeChannel =
    channels.find((c) => c.id === selectedChannelId) || channels[0];
  const previewChannel = {
    ...activeChannel,
    shots: shotsForLaneDisplay(
      activeChannel.sessionStatus,
      activeChannel.shots,
    ),
  };
  useEffect(() => {
    setProfileType(targetProfileFromTargetId(previewChannel.targetName));
  }, [previewChannel.targetName, setProfileType]);

  const liveFiringCount = channels.filter(
    (c) => c.sessionStatus === "ACTIVE",
  ).length;
  const sensorBlockingShots = liveFiringCount > 0 && sensorGate.adminHeld;

  return (
    <div
      className={`h-dvh-screen overflow-hidden flex flex-col transition-colors duration-200 ${
        isDarkMode
          ? "bg-[#0f1115] text-[#e2e2e6]"
          : "bg-[#F4F6F9] text-gray-900"
      }`}
    >
      <AdminHeader
        t={t}
        isAr={isAr}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        language={language}
        setLanguage={setLanguage}
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        liveFiringCount={liveFiringCount}
        handleLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col md:flex-row relative min-h-0 admin-app-body-offset">
        {navOpen && (
          <button
            type="button"
            aria-label={isAr ? "إغلاق القائمة" : "Close navigation overlay"}
            className="fixed inset-0 admin-app-top-offset bg-black/40 z-20 md:hidden cursor-default"
            onClick={() => setNavOpen(false)}
          />
        )}

        <AdminSidebar
          navOpen={navOpen}
          activeTab={activeTab}
          selectTab={selectTab}
          isAr={isAr}
          t={t}
          liveBoardMode={liveBoardMode}
          toggleLiveBoardMode={toggleLiveBoardMode}
          onStartAllSessions={onStartAllSessions}
          onPauseAllSessions={onPauseAllSessions}
          sensorGate={sensorGate}
          setSensorHold={setSensorHold}
        />

        <main
          className={`flex-1 overflow-hidden w-full flex flex-col min-h-0 ${
            activeTab === "CONTROL" ||
            activeTab === "REPORTS" ||
            activeTab === "HELP" ||
            activeTab === "SESSIONS" ||
            activeTab === "SHOOTERS" ||
            activeTab === "LANE_HARDWARE"
              ? ""
              : "p-4 md:p-6 overflow-y-auto max-w-7xl mx-auto"
          }`}
        >
          {activeTab === "CONTROL" && (
            <div className="flex-1 flex min-h-0 min-w-0 flex-col">
              {sensorBlockingShots && (
                <div className="shrink-0 mx-4 mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-lg border hud-alert-banner">
                  <p className="admin-text-sm font-mono">
                    {isAr
                      ? "الجلسة نشطة لكن المستشعر متوقف — الضربات لن تظهر على اللوحة."
                      : "Session is live but sensor is on HOLD — shots will not register."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSensorHold(false)}
                    className="shrink-0 hud-label px-3 py-1.5 rounded-lg hud-accent hud-glass cursor-pointer"
                  >
                    {isAr ? "تحرير المستشعر" : "Release sensor"}
                  </button>
                </div>
              )}

              <LaneWorkspace
                channels={channels}
                channel={previewChannel}
                laneFocused={laneFocused}
                controlPanelOpen={controlPanelOpen}
                setControlPanelOpen={setControlPanelOpen}
                onFocusLane={focusLane}
                onShowAllLanes={showAllLanes}
                setSelectedChannelId={handleSelectLane}
                handleAdminCommand={handleAdminCommand}
                onEndSession={onEndSession}
                onAdvanceSession={onAdvanceSession}
                onCreateSession={(config) =>
                  onCreateSession(previewChannel.id, config)
                }
                onPauseSession={() => onPauseSession(previewChannel.id)}
                onResumeSession={() => onResumeSession(previewChannel.id)}
                onDiscardSession={() => onDiscardSession(previewChannel.id)}
                onSaveFeedback={(feedback) =>
                  onSaveFeedback(previewChannel.id, feedback)
                }
                onCancelSession={() => onCancelSession(previewChannel.id)}
                isDarkMode={isDarkMode}
                language={language}
                t={t}
                profileType={profileType}
                setProfileType={setProfileType}
                showGrid={showGrid}
                setShowGrid={setShowGrid}
                zoomLevel={zoomLevel}
                changeZoom={changeZoom}
                selectedShotId={selectedShotId}
                setSelectedShotId={setSelectedShotId}
                targetContainerRef={targetContainerRef}
                calibrateMode={calibrateMode}
                setCalibrateMode={setCalibrateMode}
                onLaneCalibrate={onLaneCalibrate}
                onShotsCalibrate={onShotsCalibrate}
                triggerSuccessBanner={triggerSuccessBanner}
                availableShooters={availableShooters}
                selectedChannelId={selectedChannelId}
                onDiscardReadySession={onDiscardReadySession}
                liveBoardMode={liveBoardMode}
                calibrationLaneId={calibrationLaneId}
                setCalibrationLaneId={setCalibrationLaneId}
                onCalibrationDismiss={onCalibrationDismiss}
                onSetOffset={onSetOffset}
              />
            </div>
          )}

          {activeTab === "SESSIONS" && (
            <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-5 w-full">
              <SessionHistoryView
                isDarkMode={isDarkMode}
                profileType={profileType}
                language={language}
                triggerSuccessBanner={triggerSuccessBanner}
                availableShooters={availableShooters}
              />
            </div>
          )}

          {activeTab === "REPORTS" && (
            <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-5 w-full">
              <ReportsView
                isDarkMode={isDarkMode}
                profileType={profileType}
                setProfileType={setProfileType}
                language={language}
                t={t}
                triggerSuccessBanner={triggerSuccessBanner}
                availableShooters={availableShooters}
              />
            </div>
          )}

          {activeTab === "HELP" && (
            <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-5 w-full">
              <AdminHelp language={language} t={t} />
            </div>
          )}

          {activeTab === "SHOOTERS" && (
            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-5 w-full">
              <ShooterDevicesTab
                isAr={isAr}
                availableShooters={availableShooters}
                refreshShooters={onRefreshShooters}
                triggerSuccessBanner={triggerSuccessBanner}
              />
            </div>
          )}

          {/* Read-only commissioning view, styled exactly like the SUPER_ADMIN's
              lane hardware management. No add/delete/edit here: whatever was
              commissioned in lane hardware management is what an ADMIN sees. */}
          {activeTab === "LANE_HARDWARE" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 w-full">
              <LaneHardwarePanel
                isAr={isAr}
                triggerSuccessBanner={triggerSuccessBanner}
                readOnly
                mode="live"
              />
            </div>
          )}

          <ActivityLog
            logs={adminLogs}
            isAr={isAr}
            className="px-4 md:px-6"
            maxHeight="40dvh"
          />
        </main>
      </div>
    </div>
  );
};
