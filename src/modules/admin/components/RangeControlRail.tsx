import React, { useEffect, useState } from "react";
import { Pause, Play, Square, Pencil, Check, X, SkipForward } from "lucide-react";
import type { ActiveShooterChannel } from "../../../types";
import type { TranslationSet } from "../../../translations";
import { formatLaneLabel, laneNeedsReview } from "../../../utils/laneSession";
import { getLaneIdFromChannelId } from "../../../utils/helper";
import { useSessionStore } from "../../../store/sessionStore";
import { SessionTimer } from "../../shooter/components/SessionTimer";
import { ShotHistory } from "../../shooter/components/ShotHistory";

import {
  InstructorFeedbackForm,
  type InstructorFeedback,
} from "./InstructorFeedbackForm";
import { ConfirmDialog } from "../../../components/common/ConfirmDialog";
import { getLaneError } from "@shared/coordinates";

type RailTab = "live" | "review";

interface RangeControlRailProps {
  channel: ActiveShooterChannel;
  language: "en" | "ar";
  t: TranslationSet;
  selectedShotId: number | null;
  setSelectedShotId: (id: number | null) => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onEndSession: () => void;
  onAdvanceSession?: (channelId: string) => void;
  onDiscardReadySession: (channelId: string) => void;
  onSaveFeedback: (feedback: InstructorFeedback) => void;
  onCancelSession: () => void;
  /** Controlled offset-edit state owned by LaneWorkspace so the target board
   *  can preview bullet movement live while the admin edits the values. */
  editingOffset: boolean;
  draftOffsetX: number;
  draftOffsetY: number;
  onStartEditOffset: () => void;
  onDraftOffsetChange: (axis: "x" | "y", value: number) => void;
  onSaveOffset: () => void;
  onCancelEditOffset: () => void;
  onResetOffset: () => void;
}

export const RangeControlRail: React.FC<RangeControlRailProps> = ({
  channel,
  language,
  t,
  selectedShotId,
  setSelectedShotId,
  onPauseSession,
  onResumeSession,
  onEndSession,
  onAdvanceSession,
  onSaveFeedback,
  onCancelSession,
  onDiscardReadySession,
  editingOffset,
  draftOffsetX,
  draftOffsetY,
  onStartEditOffset,
  onDraftOffsetChange,
  onSaveOffset,
  onCancelEditOffset,
  onResetOffset,
}) => {
  const isAr = language === "ar";

  const storeChannel = useSessionStore((s) =>
    s.channels.find((ch) => ch.id === channel.id),
  );
  const active = storeChannel ?? channel;

  const shots = active.shots;
  const status = active.sessionStatus;
  const needsReview = laneNeedsReview(status);
  const [tab, setTab] = useState<RailTab>(needsReview ? "review" : "live");

  /**
   * Save is only legal once the session has actually ended (COMPLETED). The
   * review tab is reachable while the session is still live — laneNeedsReview
   * includes ACTIVE/PAUSED — so a Save tap on a running session must end it
   * first instead of finalizing it out from under the shooter. Reuses the
   * existing ConfirmDialog; the confirm action is the same End Session call
   * the rail's own End Session button makes.
   */
  const [confirmEndForSave, setConfirmEndForSave] = useState(false);

  useEffect(() => {
    if (needsReview) setTab("review");
  }, [needsReview, channel.id]);

  // Exclude the synthetic "Calibration Applied" marker (it's an activity-log
  // entry, not a real bullet) from score/dispersion math and rendering.
  const realShots = shots.filter((s) => !s.isCalibrationMarker);

  const totalScore = realShots.reduce((sum, s) => sum + s.score, 0);

  const laneId = getLaneIdFromChannelId(channel.id);
  const boardOffset = getLaneError(laneId);

  const hasCalibration = boardOffset.x !== 0 || boardOffset.y !== 0;
  const canEditOffset =
    status === "ACTIVE" || status === "PAUSED" || status === "CREATED";

  const calibratedShots = realShots.map((sh) => ({
    ...sh,
    x: sh.x + boardOffset.x,
    y: sh.y + boardOffset.y,
  }));

  const avgDeviation =
    calibratedShots.length > 0
      ? Math.round(
          calibratedShots.reduce(
            (sum, s) => sum + Math.sqrt(s.x * s.x + s.y * s.y),
            0,
          ) / calibratedShots.length,
        )
      : 0;

  const roundsValue =
    channel.bulletLimit && channel.bulletLimit > 0
      ? `${shots.length}/${channel.bulletLimit}`
      : String(shots.length);

  const laneLabel = formatLaneLabel(channel.id, language);

  const shooter =
    channel.name &&
    channel.name !== "Vacant Lane" &&
    channel.name !== "Guest Shooter"
      ? channel.name
      : channel.opId && channel.opId !== "VACANT" && channel.opId !== "GUEST"
        ? channel.opId
        : isAr
          ? "غير معيّن"
          : "Unassigned";

  const isLive = status === "ACTIVE";

  const tabBtn = (id: RailTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`range-rail-label touch-target py-1.5 rounded-md cursor-pointer transition-colors flex-1 ${
        tab === id ? "hud-tab--active" : "hud-tab--idle"
      }`}
    >
      {label}
    </button>
  );

  const sessionBtn =
    "range-rail-btn touch-target flex-1 rounded-lg cursor-pointer flex items-center justify-center gap-1 transition-colors";

  const statusLabel =
    status === "PAUSED"
      ? isAr
        ? "متوقف"
        : "Paused"
      : status === "COMPLETED"
        ? isAr
          ? "بانتظار التقييم"
          : "Review"
        : status === "CREATED"
          ? isAr
            ? "جاهز"
            : "Ready"
          : isAr
            ? "جاهز"
            : "Ready";

  return (
    <aside className="admin-range-rail range-layout-rail bg-hud-rail">
      <div className="shrink-0 px-3 py-2 border-b border-hud bg-[var(--hud-elevated)] space-y-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="range-display-label hud-accent truncate">
            {laneLabel}
          </span>

          {isLive ? (
            <span className="range-rail-label hud-success flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--hud-success)] animate-pulse" />

              {isAr ? "مباشر" : "Live"}
            </span>
          ) : (
            <span className="range-rail-label hud-text-subtle shrink-0">
              {""}
            </span>
          )}
        </div>

        <p className="range-rail-meta truncate">
          {shooter} · {active.distance}
          {shots.length > 0 && (
            <span className="hud-text-subtle">
              {" "}
              · {isAr ? "مجموعة" : "Grp"} {avgDeviation}mm
            </span>
          )}
        </p>

        {needsReview && (
          <div className="flex gap-1 hud-tab-well">
            {tabBtn("live", isAr ? "مباشر" : "Live")}

            {tabBtn("review", isAr ? "تقييم" : "Review")}
          </div>
        )}
      </div>

      {tab === "live" ? (
        <>
          <div className="shrink-0 grid grid-cols-3 gap-1 px-2 py-2 border-b border-hud">
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

          {hasCalibration && (
            <div className="shrink-0 px-2 py-2 border-b border-hud">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="range-rail-label hud-accent flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {isAr ? "معايرة" : "CALIBRATED"}
                </span>

                {!editingOffset && canEditOffset && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onStartEditOffset}
                      className="hud-label inline-flex items-center gap-1 px-1.5 py-1 rounded-md hud-toolbar-btn--idle cursor-pointer touch-target"
                    >
                      <Pencil className="w-3 h-3" />
                      {isAr ? "تعديل" : "Edit"}
                    </button>

                    <button
                      type="button"
                      onClick={onResetOffset}
                      className="hud-label inline-flex items-center gap-1 px-1.5 py-1 rounded-md hud-btn-end cursor-pointer touch-target"
                    >
                      <X className="w-3 h-3" />
                      {isAr ? "إلغاء المعايرة" : "Reset"}
                    </button>
                  </div>
                )}
              </div>

              {editingOffset ? (
                <div className="flex items-center gap-2">
                  <label className="range-rail-meta flex items-center gap-1">
                    <span className="hud-text-subtle">x</span>
                    <input
                      type="number"
                      value={draftOffsetX}
                      onChange={(e) => onDraftOffsetChange("x", Number(e.target.value))}
                      className="w-16 bg-hud-elevated border border-hud rounded px-1.5 py-1 admin-text-sm font-mono text-hud-strong focus:outline-none focus:border-hud-accent"
                    />
                  </label>

                  <label className="range-rail-meta flex items-center gap-1">
                    <span className="hud-text-subtle">y</span>
                    <input
                      type="number"
                      value={draftOffsetY}
                      onChange={(e) => onDraftOffsetChange("y", Number(e.target.value))}
                      className="w-16 bg-hud-elevated border border-hud rounded px-1.5 py-1 admin-text-sm font-mono text-hud-strong focus:outline-none focus:border-hud-accent"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={onSaveOffset}
                    className="hud-label inline-flex items-center gap-1 px-2 py-1 rounded-md hud-btn-resume cursor-pointer touch-target"
                  >
                    <Check className="w-3 h-3" />
                    {isAr ? "حفظ" : "Save"}
                  </button>

                  <button
                    type="button"
                    onClick={onCancelEditOffset}
                    className="hud-label inline-flex items-center gap-1 px-2 py-1 rounded-md hud-toolbar-btn--idle cursor-pointer touch-target"
                  >
                    <X className="w-3 h-3" />
                    {isAr ? "إلغاء" : "Cancel"}
                  </button>
                </div>
              ) : (
                <div className="range-rail-meta font-mono leading-relaxed">
                  <span className="hud-text-strong">
                    Δ x{boardOffset.x} y{boardOffset.y}mm
                  </span>
                  {channel.referenceShotId != null && (
                    <span className="hud-text-subtle">
                      {" "}
                      · REF #{channel.referenceShotId}
                    </span>
                  )}
                  {channel.calibratedShotCount != null && (
                    <span className="hud-text-subtle">
                      {" "}
                      · {channel.calibratedShotCount}{" "}
                      {isAr ? "معايرة" : "recal"}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {(status === "ACTIVE" ||
            status === "PAUSED" ||
            status === "CREATED") && (
            <div className="shrink-0 flex gap-2 px-2 py-2 border-b border-hud">
              {status === "CREATED" ? (
                <button
                  type="button"
                  onClick={onResumeSession}
                  className={`${sessionBtn} hud-btn-resume`}
                >
                  <Play className="w-3 h-3" />

                  {isAr ? "بدء الجلسة" : "Start session"}
                </button>
              ) : status === "PAUSED" ? (
                <button
                  type="button"
                  onClick={onResumeSession}
                  className={`${sessionBtn} hud-btn-resume`}
                >
                  <Play className="w-3 h-3" />

                  {isAr ? "استئناف" : "Resume"}
                </button>
              ) : status === "ACTIVE" ? (
                <button
                  type="button"
                  onClick={onPauseSession}
                  className={`${sessionBtn} hud-btn-pause`}
                >
                  <Pause className="w-3 h-3" />

                  {isAr ? "إيقاف" : "Pause"}
                </button>
              ) : null}

              {/* Multi-stage only: cuts the current stage short and arms the
                  next target. A one-stage relay has nothing to advance to —
                  ending it is what End Session does. */}
              {status === "ACTIVE" &&
              (channel.stageCount ?? 0) > 1 &&
              channel.activeStageOrder != null &&
              channel.activeStageOrder < (channel.stageCount ?? 0) - 1 ? (
                <button
                  type="button"
                  onClick={() => onAdvanceSession?.(channel.id)}
                  title={
                    isAr
                      ? `المرحلة ${(channel.activeStageOrder ?? 0) + 1} من ${channel.stageCount}`
                      : `Stage ${(channel.activeStageOrder ?? 0) + 1} of ${channel.stageCount}`
                  }
                  className={`${sessionBtn} hud-btn-secondary`}
                >
                  <SkipForward className="w-3 h-3" />

                  {isAr ? "التالية" : "Next"}
                </button>
              ) : null}

              {status === "CREATED" ? (
                <button
                  type="button"
                  onClick={() => onDiscardReadySession(channel.id)}
                  className={`${sessionBtn} hud-btn-end`}
                >
                  <Square className="w-3 h-3" />

                  {isAr ? "تجاهل" : "Discard"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEndSession}
                  className={`${sessionBtn} hud-btn-end`}
                >
                  <Square className="w-3 h-3" />

                  {isAr ? "إنهاء الجلسة" : "End Session"}
                </button>
              )}
            </div>
          )}

          <div className="admin-shot-log-panel flex-1 min-h-0 px-1 pb-1 pt-2">
            <div className="shrink-0 text-center pb-2 border-b border-hud mb-1">
              <span className="admin-text-sm tracking-[0.22em] hud-text-strong">
                {t.shotLog}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <ShotHistory
                shots={shots}
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

          {needsReview && (
            <button
              type="button"
              onClick={() => setTab("review")}
              className="range-rail-label shrink-0 mx-2 mb-2 py-2 hud-accent border border-hud-strong rounded-lg hover:bg-[var(--hud-accent-bg-subtle)] cursor-pointer transition-colors"
            >
              {isAr ? "إضافة تقييم المدرب" : "Add instructor review"}
            </button>
          )}
        </>
      ) : needsReview ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <InstructorFeedbackForm
            key={channel.id}
            language={language}
            onSave={(feedback) => {
              if (status === "COMPLETED") {
                onSaveFeedback(feedback);
              } else {
                setConfirmEndForSave(true);
              }
            }}
            onCancel={onCancelSession}
            onDiscard={() => onDiscardReadySession(channel.id)}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-3 px-3 py-4">
          <p className="range-rail-meta leading-relaxed">
            {isAr
              ? "أنهِ الجلسة أولاً لإضافة تقييم المدرب والملاحظات."
              : "End the session first to add instructor review and coach notes."}
          </p>

          {(status === "ACTIVE" ||
            status === "PAUSED" ||
            status === "CREATED") && (
            <button
              type="button"
              onClick={onEndSession}
              className="range-rail-btn px-4 py-2 uppercase hud-danger border border-[color-mix(in_srgb,var(--hud-danger)_30%,transparent)] rounded-lg hover:bg-[var(--hud-danger-bg)] cursor-pointer transition-colors"
            >
              {isAr ? "إنهاء الجلسة" : "End session"}
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmEndForSave}
        title={isAr ? "أنهِ الجلسة أولاً" : "End the session first"}
        message={
          isAr
            ? "الجلسة ما زالت قيد التشغيل. لا يمكن الحفظ قبل إنهاء الجلسة. هل تريد إنهاء الجلسة الآن؟ بعد الإنتهاء يمكنك الحفظ."
            : "The session is still running. Saving is only allowed after the session has ended. End the session now? You can save once it has ended."
        }
        language={language}
        confirmLabel={isAr ? "إنهاء الجلسة" : "End Session"}
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        variant="danger"
        onConfirm={() => {
          setConfirmEndForSave(false);
          onEndSession();
        }}
        onCancel={() => setConfirmEndForSave(false)}
      />
    </aside>
  );
};
