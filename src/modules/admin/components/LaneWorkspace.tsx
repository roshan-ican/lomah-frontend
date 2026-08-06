import React, { useEffect, useState } from "react";

import { ArrowLeft, Crosshair, Radio, X } from "lucide-react";

import type {
  ActiveShooterChannel,
  CalibrateMode,
  Shooter,
} from "../../../types";

import type { TranslationSet } from "../../../translations";

import type { SessionConfig } from "../../../types/session-control";

import { formatLaneLabel, laneHasSession } from "../../../utils/laneSession";
import { getLaneIdFromChannelId } from "../../../utils/helper";
import { targetProfileFromTargetId } from "../../../utils/targetProfile";
import { useSessionStore } from "../../../store/sessionStore";

import { TargetView } from "../../shooter/components/TargetView";

import { ActiveLanes } from "./ActiveLanes";

import { RangeControlRail } from "./RangeControlRail";

import { SessionControlPanel } from "./SessionControlPanel";

import { LatestShotPanel } from "./admin-dashboard/LatestShotPanel";

import type { InstructorFeedback } from "./InstructorFeedbackForm";

import { MobileRangeTabBar } from "../../../components/common/MobileRangeTabBar";

import { useMobilePortrait } from "../../../hooks/useMobilePortrait";

type MobilePane = "main" | "rail";

interface LaneWorkspaceProps {
  channels: ActiveShooterChannel[];

  channel: ActiveShooterChannel;

  laneFocused: boolean;

  controlPanelOpen: boolean;

  setControlPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;

  onFocusLane: (channelId: string) => void;

  onShowAllLanes: () => void;

  setSelectedChannelId: (id: string) => void;

  handleAdminCommand: (
    channelId: string,

    cmd: "PAUSE" | "RESUME" | "RESET",
  ) => void;

  onEndSession: (channelId: string) => void;
  onAdvanceSession?: (channelId: string) => void;
  onDiscardReadySession: (channelId: string) => void;

  onCreateSession: (config: SessionConfig) => void;

  onPauseSession: () => void;

  onResumeSession: () => void;

  onDiscardSession: () => void;

  onSaveFeedback: (feedback: InstructorFeedback) => void;

  onCancelSession: () => void;

  isDarkMode: boolean;

  language: "en" | "ar";

  t: TranslationSet;

  profileType: "FIGURE" | "CIRCULAR";

  setProfileType: (val: "FIGURE" | "CIRCULAR") => void;

  showGrid: boolean;

  setShowGrid: (val: boolean) => void;

  zoomLevel: number;

  changeZoom: (factor: number) => void;

  selectedShotId: number | null;

  setSelectedShotId: (id: number | null) => void;

  targetContainerRef: React.RefObject<HTMLDivElement | null>;

  calibrateMode: CalibrateMode;

  setCalibrateMode: (val: CalibrateMode) => void;

  onLaneCalibrate: (
    referenceBoardX: number,
    referenceBoardY: number,
    trueBoardX: number,
    trueBoardY: number,
    referenceShotId: number,
  ) => void;

  onShotsCalibrate: (
    updates: { shotNumber: number; x: number; y: number }[],
  ) => void;

  triggerSuccessBanner: (msg: string) => void;

  availableShooters: Shooter[];

  selectedChannelId: string;

  liveBoardMode: boolean;

  calibrationLaneId: number | null;

  setCalibrationLaneId: (laneId: number | null) => void;

  onCalibrationDismiss: () => void;

  onSetOffset: (
    laneId: number,
    offsetX: number,
    offsetY: number,
  ) => Promise<boolean>;
}

interface LiveLaneTargetCardProps {
  channel: ActiveShooterChannel;
  laneIndex: number;
  isDarkMode: boolean;
  language: "en" | "ar";
  selected: boolean;
  onSelect: (channelId: string) => void;
  triggerSuccessBanner: (msg: string) => void;
}

const LiveLaneTargetCard: React.FC<LiveLaneTargetCardProps> = ({
  channel,
  laneIndex,
  isDarkMode,
  language,
  selected,
  onSelect,
  triggerSuccessBanner,
}) => {
  const isAr = language === "ar";
  const targetRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(0.68);
  const hasSession = laneHasSession(channel.sessionStatus);
  const isLive = channel.sessionStatus === "ACTIVE";
  const visibleShots = hasSession ? channel.shots : [];
  const profile = targetProfileFromTargetId(channel.targetName);
  const totalScore = visibleShots.reduce((sum, shot) => sum + shot.score, 0);
  const laneLabel = `${isAr ? "حارة" : "Lane"} ${String(laneIndex + 1).padStart(2, "0")}`;
  const roundsLabel =
    hasSession && channel.bulletLimit && channel.bulletLimit > 0
      ? `${visibleShots.length}/${channel.bulletLimit}`
      : hasSession
        ? String(visibleShots.length)
        : "-";

  return (
    <button
      type="button"
      onClick={() => onSelect(channel.id)}
      className={`h-[240px] xl:h-[280px] text-left border bg-hud-elevated flex flex-col overflow-hidden cursor-pointer transition-colors ${
        selected
          ? "border-[var(--hud-accent)]"
          : isLive
            ? "border-[color-mix(in_srgb,var(--hud-success)_60%,transparent)]"
            : "border-hud"
      }`}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-hud">
        <div className="min-w-0">
          <div className="range-display-label hud-accent truncate">
            {laneLabel}
          </div>
          <div className="range-rail-meta truncate">
            {channel.name && channel.name !== "Vacant Lane"
              ? channel.name
              : isAr
                ? "غير معيّن"
                : "Unassigned"}
          </div>
        </div>
         <div className="text-right font-mono admin-text-2xs shrink-0">
           <div className={isLive ? "hud-success" : "hud-text-subtle"}>
             {channel.sessionStatus}
           </div>
           <div className="hud-accent tabular-nums">
             {roundsLabel} · {hasSession ? totalScore : "-"}
           </div>
           {hasSession && channel.bulletLimit && channel.bulletLimit > 0 && (
             <div className="w-20 h-1 rounded-full bg-hud/40 mt-0.5">
               <div
                 className="h-full rounded-full hud-accent transition-all"
                 style={{
                   width: `${Math.min(
                     100,
                     (visibleShots.length / channel.bulletLimit) * 100,
                   )}%`,
                 }}
               />
             </div>
           )}
         </div>
      </div>

      {hasSession ? (
        <div className="flex-1 min-h-0 p-1.5 pointer-events-none">
          <TargetView
            activeChannel={{ ...channel, shots: visibleShots }}
            profileType={profile}
            setProfileType={() => {}}
            zoomLevel={zoomLevel}
            changeZoom={(delta) =>
              setZoomLevel((z) => Math.max(0.1, Math.min(2, z + delta)))
            }
            isDarkMode={isDarkMode}
            selectedShotId={selectedShotId}
            setSelectedShotId={setSelectedShotId}
            targetContainerRef={targetRef}
            triggerSuccessBanner={triggerSuccessBanner}
            language={language}
            compact
            readOnly
            variant="hud"
            size="fill"
            hideHudStatus
            lockProfileType
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center text-center px-4">
          <span className="range-rail-meta">
            {isAr ? "لا توجد جلسة نشطة" : "No active session"}
          </span>
        </div>
      )}
    </button>
  );
};

export const LaneWorkspace: React.FC<LaneWorkspaceProps> = ({
  channels,

  channel,

  laneFocused,

  controlPanelOpen,

  setControlPanelOpen,

  onFocusLane,

  onShowAllLanes,

  setSelectedChannelId,

  handleAdminCommand,

  onEndSession,
  onAdvanceSession,

  onCreateSession,

  onPauseSession,

  onResumeSession,

  onDiscardSession,

  onSaveFeedback,

  onCancelSession,

  isDarkMode,

  language,

  t,

  setProfileType,

  zoomLevel,

  changeZoom,

  selectedShotId,

  setSelectedShotId,

  targetContainerRef,

  calibrateMode,

  setCalibrateMode,

  onLaneCalibrate,

  onShotsCalibrate,

  triggerSuccessBanner,

  availableShooters,

  selectedChannelId,
  liveBoardMode,
  calibrationLaneId,
  setCalibrationLaneId,
  onCalibrationDismiss,
  onSetOffset,
}) => {
  const isAr = language === "ar";

  const isMobilePortrait = useMobilePortrait();

  const status = channel.sessionStatus;

  const showLiveBoards = !laneFocused && liveBoardMode;

  const showTarget = laneFocused && laneHasSession(status);

  const showLiveRail = laneFocused && laneHasSession(status);

  const showAssignRail = laneFocused && status === "NONE";

  const hasRail = showLiveRail || showAssignRail;

  const laneLabel = formatLaneLabel(channel.id, language);
  const laneProfile = targetProfileFromTargetId(channel.targetName);

  const [mobilePane, setMobilePane] = useState<MobilePane>("main");

  useEffect(() => {
    if (!laneFocused) {
      setMobilePane("main");

      return;
    }

    setMobilePane(showAssignRail ? "rail" : "main");
  }, [laneFocused, showAssignRail, channel.id]);

  useEffect(() => {
    if (isMobilePortrait && mobilePane === "rail") {
      setControlPanelOpen(true);
    }
  }, [isMobilePortrait, mobilePane, setControlPanelOpen]);

  useEffect(() => {
    if (status === "COMPLETED") {
      setControlPanelOpen(true);
    }
  }, [status, setControlPanelOpen]);

  const showRailOnDesktop = laneFocused && hasRail && controlPanelOpen;

  const showRailInLayout =
    hasRail && (isMobilePortrait ? mobilePane === "rail" : showRailOnDesktop);

  // ─── Offset edit (rail) — bullets preview live; Save asks for confirmation ──
  const laneId = getLaneIdFromChannelId(channel.id);
  // The board's own offset, as the server reports it on every lane sync. This
  // used to read getLaneError(laneId) — a client-side lane-error Map that
  // nothing populates any more (see useLaneOffsets: offsets moved onto the
  // target). It therefore always answered (0, 0), so saving an offset banner'd
  // success and then snapped the inputs straight back to zero.
  const committedOffset = channel.targetOffset ?? { x: 0, y: 0 };
  const [editingOffset, setEditingOffset] = useState(false);
  const [draftOffsetX, setDraftOffsetX] = useState(committedOffset.x);
  const [draftOffsetY, setDraftOffsetY] = useState(committedOffset.y);
  const [confirmOffset, setConfirmOffset] = useState(false);

  useEffect(() => {
    if (!editingOffset) {
      setDraftOffsetX(committedOffset.x);
      setDraftOffsetY(committedOffset.y);
    }
  }, [committedOffset.x, committedOffset.y, editingOffset]);

  const startEditOffset = () => {
    setDraftOffsetX(committedOffset.x);
    setDraftOffsetY(committedOffset.y);
    setEditingOffset(true);
  };

  const draftOffsetChange = (axis: "x" | "y", value: number) => {
    if (axis === "x") setDraftOffsetX(value);
    else setDraftOffsetY(value);
  };

  const cancelEditOffset = () => {
    setEditingOffset(false);
    setConfirmOffset(false);
    setDraftOffsetX(committedOffset.x);
    setDraftOffsetY(committedOffset.y);
  };

  const requestSaveOffset = () => setConfirmOffset(true);

  const confirmSaveOffset = async () => {
    const ok = await onSetOffset(
      laneId,
      Number(draftOffsetX) || 0,
      Number(draftOffsetY) || 0,
    );
    if (ok) {
      setEditingOffset(false);
      setConfirmOffset(false);
    }
  };

  const [confirmReset, setConfirmReset] = useState(false);

  const requestResetOffset = () => setConfirmReset(true);

  const confirmResetOffset = async () => {
    const ok = await onSetOffset(laneId, 0, 0);
    if (ok) {
      useSessionStore
        .getState()
        .setChannels((prev) =>
          prev.map((c) =>
            c.id === channel.id
              ? {
                  ...c,
                  referenceShotId: undefined,
                  calibratedShotCount: undefined,
                }
              : c,
          ),
        );
      setEditingOffset(false);
    }
    setConfirmReset(false);
  };

  const previewOffset = editingOffset
    ? { x: Number(draftOffsetX) || 0, y: Number(draftOffsetY) || 0 }
    : null;

  const toggleCalibrate = () => {
    if (calibrateMode === "bulk" || calibrateMode === "pick") {
      setCalibrateMode("off");
      setCalibrationLaneId(null);

      setSelectedShotId(null);

      return;
    }

    // Pick is a one-time, first-calibration convenience. Once it has been
    // chosen (even if cancelled), only bulk calibration is ever offered again.
    if (channel.pickUsed) {
      setCalibrateMode("bulk");
      setCalibrationLaneId(getLaneIdFromChannelId(channel.id));

      triggerSuccessBanner(
        isAr
          ? "اسحب الطلقات لمحاذاة المجموعة مع الهدف"
          : "Drag shots to align your group with the target",
      );

      return;
    }

    setCalibrateMode("pick");
    setCalibrationLaneId(getLaneIdFromChannelId(channel.id));

    // Mark pick as used the instant it's chosen so it can never be re-entered,
    // even if the user toggles calibration off without completing it.
    const chId = channel.id;
    useSessionStore
      .getState()
      .setChannels((prev) =>
        prev.map((c) => (c.id === chId ? { ...c, pickUsed: true } : c)),
      );

    triggerSuccessBanner(
      isAr
        ? "انقر على طلقة في قائمة الطلقات أو على الهدف لتعيينها كمركز حقيقي، ثم اسحبها إلى مكانها"
        : "Tap a shot in the shot log or on the board to set it as the true center, then drag it into place",
    );
  };

  const calibrateBtn = (
    <>
      <span className="hud-divider h-3" />

      <button
        type="button"
        onClick={toggleCalibrate}
        disabled={channel.shots.length === 0}
        className={`hud-label px-2 py-1 cursor-pointer inline-flex items-center gap-1 disabled:opacity-30 ${
          calibrateMode === "bulk" || calibrateMode === "pick"
            ? "hud-toolbar-btn--active"
            : "hud-toolbar-btn--idle"
        }`}
      >
        <Crosshair className="w-3 h-3" />

        {isAr ? "معايرة" : "CALIBRATE"}
      </button>
    </>
  );

  const railContent = showLiveRail ? (
    <RangeControlRail
      channel={channel}
      language={language}
      t={t}
      selectedShotId={selectedShotId}
      setSelectedShotId={setSelectedShotId}
      onPauseSession={onPauseSession}
      onResumeSession={onResumeSession}
      onEndSession={() => onEndSession(channel.id)}
      onAdvanceSession={onAdvanceSession}
      onSaveFeedback={onSaveFeedback}
      onCancelSession={onCancelSession}
      onDiscardReadySession={onDiscardSession}
      editingOffset={editingOffset}
      draftOffsetX={draftOffsetX}
      draftOffsetY={draftOffsetY}
      onStartEditOffset={startEditOffset}
      onDraftOffsetChange={draftOffsetChange}
      onSaveOffset={requestSaveOffset}
      onCancelEditOffset={cancelEditOffset}
      onResetOffset={requestResetOffset}
    />
  ) : showAssignRail ? (
    <aside className="admin-range-rail range-layout-rail bg-hud-rail flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-hud space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="range-rail-label hud-accent">
            {isAr ? "تعيين الحارة" : "ASSIGN LANE"}
          </span>

          {!isMobilePortrait && (
            <button
              type="button"
              onClick={() => setControlPanelOpen(false)}
              className="lg:hidden touch-target inline-flex items-center justify-center hud-text-muted hover:hud-text cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="range-rail-meta">{laneLabel}</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 hud-panel-contents">
        <SessionControlPanel
          variant="hud"
          channel={channel}
          channels={channels}
          setSelectedChannelId={setSelectedChannelId}
          onCreateSession={onCreateSession}
          onPauseSession={onPauseSession}
          onResumeSession={onResumeSession}
          onEndSession={() => onEndSession(channel.id)}
          onAdvanceSession={onAdvanceSession}
          onDiscardSession={onDiscardSession}
          onSaveFeedback={onSaveFeedback}
          onCancelSession={onCancelSession}
          language={language}
          t={t}
          availableShooters={availableShooters}
        />
      </div>
    </aside>
  ) : null;

  const mobileTabs = showTarget
    ? [
        { id: "main", label: isAr ? "الهدف" : "Target" },

        { id: "rail", label: isAr ? "التحكم" : "Control" },
      ]
    : [
        { id: "main", label: isAr ? "الحارات" : "Lanes" },

        { id: "rail", label: isAr ? "تعيين" : "Assign" },
      ];

  return (
    <div className="flex-1 flex min-h-0 min-w-0 flex-col overflow-visible">
      <div
        className={`flex-1 min-h-0 range-layout-inner range-layout-inner--pane ${
          isMobilePortrait && mobilePane === "rail"
            ? "range-layout-show-rail"
            : ""
        }`}
      >
        <div className="range-layout-target relative flex flex-col min-h-0 overflow-visible bg-hud-target-stage">
          {showLiveBoards ? (
            <div className="flex-1 min-h-0 overflow-y-auto admin-lane-grid-panel bg-[#0f1115]">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <h2 className="hud-label hud-accent flex items-center gap-2">
                    <Radio className="w-4 h-4" />
                    {isAr
                      ? "العرض المباشر لكل الحارات"
                      : "ALL LANES LIVE BOARD"}
                  </h2>
                  <p className="font-mono admin-text-xs hud-text-muted mt-1">
                    {isAr
                      ? "راقب كل لوحات الأهداف أثناء استقبال ضربات UDP"
                      : "Monitor every target board as UDP shots arrive"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
                {channels.map((lane, idx) => (
                  <LiveLaneTargetCard
                    key={lane.id}
                    channel={lane}
                    laneIndex={idx}
                    isDarkMode={isDarkMode}
                    language={language}
                    selected={selectedChannelId === lane.id}
                    onSelect={onFocusLane}
                    triggerSuccessBanner={triggerSuccessBanner}
                  />
                ))}
              </div>
            </div>
          ) : showTarget ? (
            <>
              <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-hud bg-hud-rail">
                <button
                  type="button"
                  onClick={onShowAllLanes}
                  aria-label={isAr ? "كل الحارات" : "All lanes"}
                  className="touch-target inline-flex items-center justify-center rounded-md hud-text-muted hover:hud-accent hover:bg-[var(--hud-accent-bg-subtle)] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <span className="range-display-label hud-accent tracking-[0.14em] truncate">
                  {laneLabel}
                </span>
              </div>

                {calibrationLaneId != null &&
                `CH-${calibrationLaneId}` === channel.id &&
                calibrateMode !== "off" && (
                  <div className="shrink-0 mx-2 mt-2 flex items-center justify-between gap-3 px-4 py-3 border border-hud rounded-lg hud-accent-bg-subtle">
                    <p className="admin-text-sm font-mono hud-accent">
                      {calibrateMode === "pick"
                        ? isAr
                          ? "عيّن طلقة واحدة كمركز حقيقي: انقر عليها في قائمة الطلقات أو على الهدف، ثم اسحبها إلى موضعها الصحيح، ثم أكّد"
                          : "Pick one bullet as the true center: tap it in the shot log or on the board, drag it to the correct spot, then confirm"
                        : isAr
                          ? "اسحب الطلقات لمحاذاة المجموعة مع الهدف"
                          : "Drag shots to align your group with the target"}
                    </p>
                    <button
                      type="button"
                      onClick={onCalibrationDismiss}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-hud bg-hud-elevated hover:bg-hud cursor-pointer admin-text-sm"
                    >
                      {isAr ? "تخطي" : "Done"}
                    </button>
                  </div>
                )}

               <div className="flex-1 min-h-0 target-stage overflow-visible px-0.5 sm:px-2 py-0.5">
                 <div className="target-fit-box h-full">
                    {/* Follows the SELECTED shot when the admin clicks one in
                        the shot log or on the board, so the 'D' sensor query
                        inside it targets that bullet. Falls back to the newest
                        shot when nothing is selected. */}
                    {(() => {
                      const shown =
                        channel.shots.find((s) => s.id === selectedShotId) ??
                        channel.shots[channel.shots.length - 1];
                      if (!shown) return null;
                      return (
                        <LatestShotPanel
                          latestShot={{
                            id: shown.id,
                            x: shown.x,
                            y: shown.y,
                            score: shown.score,
                            isMiss: shown.isMiss ?? false,
                            timestamp: shown.timestamp,
                            targetId: shown.targetId,
                          }}
                          isSelected={shown.id === selectedShotId}
                          isAr={isAr}
                        />
                      );
                    })()}
                   <TargetView
                    key={`${channel.id}-${channel.sessionId ?? "none"}-${laneProfile}`}
                    activeChannel={channel}
                    profileType={laneProfile}
                    setProfileType={setProfileType}
                    lockProfileType={laneHasSession(status)}
                    // showGrid={showGrid}
                    // setShowGrid={setShowGrid}
                    zoomLevel={zoomLevel}
                    changeZoom={changeZoom}
                    isDarkMode={isDarkMode}
                    selectedShotId={selectedShotId}
                    setSelectedShotId={setSelectedShotId}
                    targetContainerRef={targetContainerRef}
                    triggerSuccessBanner={triggerSuccessBanner}
                    language={language}
                    readOnly={false}
                    calibrateMode={calibrateMode}
                    onLaneCalibrate={
                      calibrateMode === "bulk" || calibrateMode === "pick"
                        ? onLaneCalibrate
                        : undefined
                    }
                    onShotsCalibrate={
                      calibrateMode === "bulk" ? onShotsCalibrate : undefined
                    }
                    variant="hud"
                    size="fill"
                    distance={channel.distance}
                    hideHudStatus
                    previewOffset={previewOffset}
                    toolbarExtra={calibrateBtn}
                  />
                </div>
              </div>

              {confirmOffset && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="mx-4 w-full max-w-xs rounded-lg border border-hud-strong bg-hud-rail p-4 shadow-xl">
                    <p className="range-rail-meta leading-relaxed mb-4">
                      {isAr
                        ? `هل أنت متأكد أنك تريد تعديل إزاحة الحارة إلى (${draftOffsetX}, ${draftOffsetY}) مم؟ ستُعاد تسجيل جميع الطلقات.`
                        : `Are you sure you want to edit the lane offset to (${draftOffsetX}, ${draftOffsetY}) mm? All shots will be re-scored.`}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={confirmSaveOffset}
                        className="flex-1 hud-label px-3 py-2 rounded-lg hud-btn-resume cursor-pointer"
                      >
                        {isAr ? "نعم، تعديل" : "Yes, edit"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmOffset(false)}
                        className="flex-1 hud-label px-3 py-2 rounded-lg hud-toolbar-btn--idle cursor-pointer"
                      >
                        {isAr ? "إلغاء" : "Cancel"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {confirmReset && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="mx-4 w-full max-w-xs rounded-lg border border-hud-strong bg-hud-rail p-4 shadow-xl">
                    <p className="range-rail-meta leading-relaxed mb-4">
                      {isAr
                        ? "هل أنت متأكد أنك تريد إلغاء معايرة الحارة؟ ستعود جميع الطلقات إلى إحداثيات المستشعر الأصلية."
                        : "Are you sure you want to reset the lane calibration? All shots will return to their original sensor coordinates."}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={confirmResetOffset}
                        className="flex-1 hud-label px-3 py-2 rounded-lg hud-btn-end cursor-pointer"
                      >
                        {isAr ? "نعم، إلغاء المعايرة" : "Yes, reset"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmReset(false)}
                        className="flex-1 hud-label px-3 py-2 rounded-lg hud-toolbar-btn--idle cursor-pointer"
                      >
                        {isAr ? "إلغاء" : "Cancel"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto admin-lane-grid-panel bg-[#0f1115]">
              <ActiveLanes
                channels={channels}
                selectedChannelId={selectedChannelId}
                setSelectedChannelId={setSelectedChannelId}
                onEnterLane={onFocusLane}
                handleAdminCommand={handleAdminCommand}
                onEndSession={onEndSession}
                language={language}
                t={t}
                variant="command"
              />
            </div>
          )}
        </div>

        {laneFocused && showRailInLayout && railContent}
      </div>

      {laneFocused && hasRail && isMobilePortrait && (
        <MobileRangeTabBar
          tabs={mobileTabs}
          active={mobilePane}
          onChange={(id) => setMobilePane(id as MobilePane)}
        />
      )}

      {laneFocused && hasRail && !controlPanelOpen && !isMobilePortrait && (
        <button
          type="button"
          onClick={() => setControlPanelOpen(true)}
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-20 flex-col items-center gap-1 px-2 py-4 hud-sidebar border border-hud-strong border-r-0 hud-accent cursor-pointer hover:bg-[var(--hud-accent-bg-subtle)]"
          title={isAr ? "فتح لوحة التحكم" : "Open range control"}
        >
          <span className="hud-label [writing-mode:vertical-rl] rotate-180">
            {isAr ? "تحكم" : "CONTROL"}
          </span>
        </button>
      )}
    </div>
  );
};
