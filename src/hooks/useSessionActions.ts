// useSessionActions — all the admin "do something to a session" commands.
//
// Every command is addressed BY SESSION ID now, not by lane. The old backend
// exposed RPC-style routes that took a laneId in the body (/api/sessions/pause
// { laneId }) and resolved the lane's one live session server-side; the NestJS
// backend is REST and addresses the session directly
// (POST /api/sessions/:id/pause). A lane is just where a session happens.
//
// The practical consequence: a command cannot be issued for a lane that has no
// session id in local state. That is not a regression — it was always true,
// the old API just hid the failure by resolving (or failing to resolve) the
// lane server-side and returning a confusing error.

import { useState } from "react";
import { api } from "../utils/api";
import { targetProfileFromTargetId } from "../utils/targetProfile";
import { useSessionStore } from "../store/sessionStore";
import { toVacantLane } from "../store/channelMutations";
import type { Session } from "../types";

interface SessionActionsDeps {
  isAr: boolean;
  triggerSuccessBanner: (msg: string) => void;
  addAdminLog: (msg: string) => void;
  setProfileType: (val: "FIGURE" | "CIRCULAR") => void;
}

/** One entry in the firing plan. Bullet count and clock are per-stage. */
export interface StagePlan {
  targetId: string;
  bulletLimit?: number;
  durationSeconds?: number;
}

export function useSessionActions({
  isAr,
  triggerSuccessBanner,
  addAdminLog,
  setProfileType,
}: SessionActionsDeps) {
  const { channels, setChannels } = useSessionStore();

  const [discardConfirm, setDiscardConfirm] = useState<{
    open: boolean;
    channelId: string | null;
  }>({ open: false, channelId: null });

  /** Resolve a lane channel to the session it is running, or surface why not. */
  const requireSessionId = (chId: string): string | null => {
    const sessionId = channels.find((c) => c.id === chId)?.sessionId;
    if (!sessionId) {
      triggerSuccessBanner(
        isAr
          ? "لا توجد جلسة على هذه الحارة."
          : "No session on this lane to act on.",
      );
      return null;
    }
    return sessionId;
  };

  const fail = (err: unknown, fallback: string) =>
    triggerSuccessBanner(
      `Error: ${err instanceof Error ? err.message : fallback}`,
    );

  const handleAdminCommand = async (
    channelId: string,
    cmd: "PAUSE" | "RESUME" | "RESET",
  ) => {
    const laneObj = channels.find((c) => c.id === channelId);
    if (!laneObj) return;

    if (cmd === "PAUSE") return handlePauseSession(channelId);
    if (cmd === "RESUME") return handleStartOrResumeSession(channelId);

    // RESET clears one STAGE's shots — shots belong to a stage, not a session,
    // so there is no "reset the session's shots" operation to call.
    const sessionId = requireSessionId(channelId);
    if (!sessionId) return;
    const stageId = laneObj.activeStageId;
    if (!stageId) {
      triggerSuccessBanner(
        isAr ? "لا توجد مرحلة نشطة." : "No active stage to reset.",
      );
      return;
    }
    try {
      await api.post(`/sessions/${sessionId}/stages/${stageId}/reset`);
      setChannels((prev) =>
        prev.map((ch) => (ch.id === channelId ? { ...ch, shots: [] } : ch)),
      );
      addAdminLog(`RESET: Purged shots for ${laneObj.name} (${laneObj.id}).`);
      triggerSuccessBanner(
        isAr ? "تم تصفير الإطلاقات الحالية." : "Shot logs cleared.",
      );
    } catch (err) {
      fail(err, "Failed to reset shots");
    }
  };

  /**
   * Create a session from a stage plan.
   *
   * `stages` fire in array order, each against its own target with its own
   * bullet count and clock — this is the multi-target capability the whole
   * rewrite exists for. A single-target relay is simply a one-stage plan.
   */
  const handleCreateSession = async (
    chId: string,
    config: {
      shooterName: string;
      stages: StagePlan[];
      distance?: string;
      notes?: string;
    },
  ) => {
    const laneId = parseInt(chId.replace("CH-", ""), 10);
    const stages = config.stages ?? [];
    const first = stages[0];
    if (!first) {
      triggerSuccessBanner(
        isAr ? "يجب إضافة مرحلة واحدة على الأقل." : "Add at least one stage.",
      );
      return;
    }
    setProfileType(targetProfileFromTargetId(first.targetId));

    // "Edit Config" lands here too, and creating is the only way to change a
    // plan — SessionsService has no update-stages operation. Cancel the
    // existing CREATED session first, or the lane accumulates a second live
    // session that nothing will ever address again: every command in this file
    // goes through the ONE session id held in channel state, so the abandoned
    // one can be neither started nor stopped, and it keeps showing up in
    // GET /sessions forever.
    const existing = channels.find((c) => c.id === chId);
    if (existing?.sessionId && existing.sessionStatus === "CREATED") {
      try {
        await api.post(`/sessions/${existing.sessionId}/stop`);
      } catch {
        // Non-fatal: a stale id that no longer exists server-side is exactly
        // the state we are trying to leave behind.
      }
    }

    try {
      // The created session is the ONLY place its id comes from — capture it,
      // or every subsequent start/pause/end on this lane has nothing to address.
      const created = await api.post<Session>("/sessions", {
        laneId,
        shooterName: config.shooterName || undefined,
        stages,
      });

      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === chId
            ? {
                ...ch,
                name: config.shooterName || ch.name,
                opId: config.shooterName || ch.opId,
                sessionStatus: "CREATED",
                sessionId: created.id,
                activeStageId: created.stages?.[0]?.id,
                activeStageOrder: created.stages?.[0]?.order,
                // Without this the "Next Stage" control stays hidden on a
                // multi-stage plan until some later WS event happens to refill
                // it — the control panel gates on stageCount > 1.
                stageCount: created.stages?.length ?? stages.length,
                targetName: first.targetId,
                distance: config.distance ?? ch.distance,
                bulletLimit: first.bulletLimit,
                durationSeconds: first.durationSeconds,
                notes: config.notes,
                shots: [],
                referenceShotId: undefined,
                calibratedShotCount: undefined,
                pickUsed: false,
              }
            : ch,
        ),
      );
      triggerSuccessBanner(
        isAr ? "تمت تهيئة الجلسة." : "Session configured.",
      );
    } catch (err) {
      fail(err, "Failed to create session");
    }
  };

  const handlePauseSession = async (chId: string) => {
    const sessionId = requireSessionId(chId);
    if (!sessionId) return;
    try {
      await api.post(`/sessions/${sessionId}/pause`);
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === chId ? { ...ch, sessionStatus: "PAUSED" } : ch,
        ),
      );
      triggerSuccessBanner(isAr ? "تم تعليق الجلسة." : "Session paused.");
    } catch (err) {
      fail(err, "Failed to pause session");
    }
  };

  /** Both the "Start" (status CREATED) and "Resume" (status PAUSED) buttons in
   *  the UI funnel here. Dispatch on the lane's actual status: a session that
   *  has never run belongs on /start, and only a PAUSED one is a real resume. */
  const handleStartOrResumeSession = async (chId: string) => {
    const sessionId = requireSessionId(chId);
    if (!sessionId) return;
    const isFirstStart =
      channels.find((c) => c.id === chId)?.sessionStatus === "CREATED";
    try {
      await api.post(
        `/sessions/${sessionId}/${isFirstStart ? "start" : "resume"}`,
      );
      // Do NOT optimistically flip status here — let the WS session:started /
      // session:resumed event drive it. That event carries the authoritative
      // stage startedAt and totalPausedMs, so the countdown credits the pause.
      triggerSuccessBanner(
        isFirstStart
          ? isAr
            ? "تم بدء الجلسة."
            : "Session started."
          : isAr
            ? "تم استئناف الجلسة."
            : "Session resumed.",
      );
    } catch (err) {
      fail(
        err,
        isFirstStart ? "Failed to start session" : "Failed to resume session",
      );
    }
  };

  const handleResumeAllSessions = async () => {
    const lanesToStart = channels.filter(
      (ch) =>
        (ch.sessionStatus === "CREATED" || ch.sessionStatus === "PAUSED") &&
        ch.sessionId,
    );
    if (lanesToStart.length === 0) {
      triggerSuccessBanner(
        isAr
          ? "لا توجد جلسات جاهزة لبدء التشغيل الجماعي."
          : "No lanes are ready for bulk start.",
      );
      return;
    }
    const results = await Promise.all(
      lanesToStart.map(async (ch) => {
        const isFirstStart = ch.sessionStatus === "CREATED";
        try {
          await api.post(
            `/sessions/${ch.sessionId}/${isFirstStart ? "start" : "resume"}`,
          );
          setChannels((prev) =>
            prev.map((c) =>
              c.id === ch.id ? { ...c, sessionStatus: "ACTIVE" } : c,
            ),
          );
          return { lane: ch.id, ok: true as const };
        } catch (err: unknown) {
          // Deliberately surfaced, not swallowed: a lane whose target never
          // acknowledged PLAY would otherwise look live when it is not.
          return {
            lane: ch.id,
            ok: false as const,
            message: err instanceof Error ? err.message : "unknown error",
          };
        }
      }),
    );

    const failed = results.filter((r) => !r.ok);
    const startedCount = results.length - failed.length;
    if (failed.length === 0) {
      triggerSuccessBanner(
        isAr
          ? `تم تشغيل ${startedCount} حارة معاً.`
          : `Started ${startedCount} lanes together.`,
      );
      return;
    }
    failed.forEach((r) =>
      addAdminLog(
        `START FAILED: ${r.lane} — ${"message" in r ? r.message : "unknown error"}`,
      ),
    );
    triggerSuccessBanner(
      isAr
        ? `تم تشغيل ${startedCount} حارة. فشل: ${failed.map((r) => r.lane).join(", ")}`
        : `Started ${startedCount} lane(s). Failed: ${failed.map((r) => r.lane).join(", ")}`,
    );
  };

  const handlePauseAllSessions = async () => {
    const lanesToPause = channels.filter(
      (ch) => ch.sessionStatus === "ACTIVE" && ch.sessionId,
    );
    if (lanesToPause.length === 0) {
      triggerSuccessBanner(
        isAr
          ? "لا توجد جلسات نشطة لإيقافها جماعياً."
          : "No active lanes to pause together.",
      );
      return;
    }
    await Promise.all(
      lanesToPause.map(async (ch) => {
        try {
          await api.post(`/sessions/${ch.sessionId}/pause`);
          setChannels((prev) =>
            prev.map((c) =>
              c.id === ch.id ? { ...c, sessionStatus: "PAUSED" } : c,
            ),
          );
        } catch {
          // Best-effort bulk action; individual failures stay silent here and
          // the lane simply keeps its ACTIVE status.
        }
      }),
    );
    triggerSuccessBanner(
      isAr
        ? `تم إيقاف ${lanesToPause.length} حارة معاً.`
        : `Paused ${lanesToPause.length} lanes together.`,
    );
  };

  /**
   * Close the current stage and arm the next one.
   *
   * Only needed to cut a stage SHORT: the backend advances on its own when the
   * bullet limit is reached (SensorService) or the stage clock expires
   * (StageMonitorService). This is the range officer overriding that — "move
   * them on now".
   *
   * Advancing from the LAST stage completes the session, so the caller decides
   * whether to offer it; here it is simply allowed.
   */
  const handleAdvanceSession = async (chId: string) => {
    const sessionId = requireSessionId(chId);
    if (!sessionId) return;
    const ch = channels.find((c) => c.id === chId);
    if (ch?.sessionStatus !== "ACTIVE") {
      triggerSuccessBanner(
        isAr
          ? "يمكن الانتقال فقط أثناء جلسة نشطة."
          : "Can only advance an active session.",
      );
      return;
    }
    try {
      await api.post(`/sessions/${sessionId}/advance`);
      // Status/stage are driven by the WS session:advanced event, which
      // carries the authoritative next stage — no optimistic update here.
      const isLast =
        ch.stageCount != null &&
        ch.activeStageOrder != null &&
        ch.activeStageOrder >= ch.stageCount - 1;
      triggerSuccessBanner(
        isLast
          ? isAr
            ? "اكتملت المرحلة الأخيرة — انتهت الجلسة."
            : "Final stage complete — session finished."
          : isAr
            ? "تم الانتقال إلى المرحلة التالية."
            : "Advanced to the next stage.",
      );
    } catch (err) {
      fail(err, "Failed to advance stage");
    }
  };

  /** Finish with a valid scorecard. Contrast cancel/discard, which use /stop. */
  const handleEndSession = async (chId: string) => {
    const sessionId = requireSessionId(chId);
    if (!sessionId) return;
    try {
      await api.post(`/sessions/${sessionId}/end`);
      triggerSuccessBanner(
        isAr ? "تم إنهاء الجولة بنجاح." : "Session completed.",
      );
    } catch (err) {
      fail(err, "Failed to end session");
    }
  };

  const handleDiscardSession = async (chId: string) => {
    setDiscardConfirm({ open: true, channelId: chId });
  };

  /**
   * Discard, cancel and discard-ready were three separate endpoints on the old
   * backend. They are all the same operation — abandon this session without a
   * valid scorecard — so they all map to /stop, which sets status CANCELLED.
   */
  const stopSession = async (chId: string, message: string) => {
    const sessionId = requireSessionId(chId);
    if (!sessionId) return;
    try {
      await api.post(`/sessions/${sessionId}/stop`);
      setChannels((prev) =>
        prev.map((ch) => (ch.id === chId ? toVacantLane(ch) : ch)),
      );
      triggerSuccessBanner(message);
    } catch (err) {
      fail(err, "Failed to stop session");
    }
  };

  const executeDiscardSession = async () => {
    const chId = discardConfirm.channelId;
    if (!chId) return;
    setDiscardConfirm({ open: false, channelId: null });
    await stopSession(
      chId,
      isAr ? "تم إلغاء الجلسة وإعادة ضبط الحارة." : "Session discarded. Lane reset.",
    );
  };

  const handleCancelSession = (chId: string) =>
    stopSession(
      chId,
      isAr ? "تم حفظ الجلسة كملغاة." : "Session saved as cancelled.",
    );

  const handleDiscardReadySession = (chId: string) =>
    stopSession(
      chId,
      isAr ? "تم إلغاء الجلسة الجاهزة." : "Ready session discarded.",
    );

  /**
   * Coach's notes. The backend stores `feedback` as free text plus optional
   * `notes`, so the structured scores are flattened into a readable line —
   * there are no numeric columns for them to land in.
   */
  const handleSaveFeedback = async (
    chId: string,
    feedback: {
      triggerControl: number;
      breathing: number;
      targetAcquisition: number;
      comments: string;
    },
  ) => {
    const sessionId = requireSessionId(chId);
    if (!sessionId) return;
    try {
      await api.patch(`/sessions/${sessionId}/feedback`, {
        feedback: feedback.comments || "Reviewed",
        notes: [
          `Trigger control: ${feedback.triggerControl}`,
          `Breathing: ${feedback.breathing}`,
          `Target acquisition: ${feedback.targetAcquisition}`,
        ].join(" | "),
      });
      triggerSuccessBanner(
        isAr
          ? "تم حفظ التوجيهات وإنهاء الجلسة."
          : "Coach feedback saved. Lane session closed.",
      );
    } catch (err) {
      fail(err, "Failed to save feedback");
    }
  };

  return {
    handleAdminCommand,
    handleCreateSession,
    handlePauseSession,
    handleStartOrResumeSession,
    handleResumeAllSessions,
    handlePauseAllSessions,
    handleAdvanceSession,
    handleEndSession,
    handleDiscardSession,
    executeDiscardSession,
    handleSaveFeedback,
    handleCancelSession,
    handleDiscardReadySession,
    discardConfirm,
    setDiscardConfirm,
  };
}
