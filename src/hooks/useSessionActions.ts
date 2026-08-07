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
import { api, ApiError } from "../utils/api";
import { targetProfileFromTargetId } from "../utils/targetProfile";
import { useSessionStore } from "../store/sessionStore";
import { toVacantLane } from "../store/channelMutations";
import { getLaneIdFromChannelId } from "../utils/helper";
import { clearCachedShots } from "../db/shotCache";
import type { Session } from "../types";

interface SessionActionsDeps {
  isAr: boolean;
  triggerSuccessBanner: (msg: string) => void;
  /** Failures get their own channel. Routing them through the success banner
   *  is what made a rejected save render as a green checkmark. */
  triggerErrorBanner: (msg: string) => void;
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
  triggerErrorBanner,
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
      triggerErrorBanner(
        isAr
          ? "لا توجد جلسة على هذه الحارة."
          : "No session on this lane to act on.",
      );
      return null;
    }
    return sessionId;
  };

  /**
   * Show why something failed, in the operator's words where possible.
   *
   * `ApiError.message` is already the server's own sentence — apiFetchJson
   * joins class-validator's array or lifts Nest's `message` string — so the
   * lane id, the blocking session and its status all come through verbatim.
   * `fallback` only covers the cases with no server response at all (network
   * down, backend not running), where the raw TypeError ("Failed to fetch")
   * says nothing useful to a range officer.
   *
   * Returns false so callers can `if (!ok) return;` rather than having to
   * duplicate the try/catch.
   */
  const fail = (err: unknown, fallback: string): false => {
    const detail =
      err instanceof ApiError
        ? err.message
        : err instanceof Error && err.message && !/fetch/i.test(err.message)
          ? err.message
          : isAr
            ? "تعذّر الوصول إلى الخادم."
            : "Could not reach the server.";
    triggerErrorBanner(`${fallback}: ${detail}`);
    addAdminLog(`FAILED: ${fallback} — ${detail}`);
    return false;
  };

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
      triggerErrorBanner(
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
      fail(err, isAr ? "تعذّر تصفير الإطلاقات" : "Could not clear shots");
    }
  };

  /**
   * Create a session from a stage plan, or replace the lane's pending one.
   *
   * `stages` fire in array order, each against its own target with its own
   * bullet count and clock — this is the multi-target capability the whole
   * rewrite exists for. A single-target relay is simply a one-stage plan.
   *
   * RETURNS whether the server accepted it. This is not decoration: "Edit
   * Config" closes its panel on the strength of this boolean. It used to call
   * this function without awaiting it and close unconditionally, so a rejected
   * save collapsed the form and left the edited plan painted on the grid from
   * local state alone — indistinguishable from a real save until a reload put
   * the old plan back.
   */
  const handleCreateSession = async (
    chId: string,
    config: {
      shooterName: string;
      stages: StagePlan[];
      distance?: string;
      notes?: string;
    },
  ): Promise<boolean> => {
    const laneId = parseInt(chId.replace("CH-", ""), 10);
    const stages = config.stages ?? [];
    const first = stages[0];
    if (!first) {
      triggerErrorBanner(
        isAr ? "يجب إضافة مرحلة واحدة على الأقل." : "Add at least one stage.",
      );
      return false;
    }

    // "Edit Config" lands here too: creating is the only way to change a plan,
    // since SessionsService has no update-stages operation.
    //
    // The swap is the SERVER's job now, not two unsequenced calls from here.
    // This used to POST /stop and then POST /sessions, which had three ways to
    // go wrong that all ended with the operator believing a plan was stored:
    // the stop could fail while the create succeeded (two open sessions on one
    // lane, only one of them addressable), the stop could succeed while the
    // create failed (lane silently emptied and the plan lost), and the stop was
    // skipped entirely for anything other than status CREATED, so editing a
    // running relay forked the lane outright. `replaceExisting` hands both
    // halves to one transaction that either applies or leaves the lane alone.
    //
    // "Open" here must mean exactly what the server means by it — the statuses
    // SessionsService.findAll treats as live. A COMPLETED session awaiting
    // review is NOT open: it no longer occupies the lane server-side, so
    // asking to replace it would be a request about a session the guard
    // cannot see.
    const existing = channels.find((c) => c.id === chId);
    const replaceExisting =
      !!existing?.sessionId &&
      (existing.sessionStatus === "CREATED" ||
        existing.sessionStatus === "ACTIVE" ||
        existing.sessionStatus === "PAUSED");

    // Only mutate view state the request cannot roll back AFTER it succeeds.
    // setProfileType used to run here, before the POST, so a refused save left
    // the target board rendering the profile of a plan that was never stored.

    try {
      // The created session is the ONLY place its id comes from — capture it,
      // or every subsequent start/pause/end on this lane has nothing to address.
      const created = await api.post<Session>("/sessions", {
        laneId,
        shooterName: config.shooterName || undefined,
        // Persisted server-side now (Session.notes). Sending it used to 400
        // under `forbidNonWhitelisted`, so it was simply never sent and lived
        // only in this browser's memory and IndexedDB — which is why notes
        // vanished on reload and never appeared on a second admin console.
        notes: config.notes?.trim() || undefined,
        stages,
        replaceExisting,
      });

      setProfileType(targetProfileFromTargetId(first.targetId));

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
                // Echo what the SERVER stored, not what the form held. If the
                // column ever truncates or normalises the text, the panel
                // shows the stored value rather than a hopeful local copy.
                notes: created.notes ?? undefined,
                shots: [],
                referenceShotId: undefined,
                calibratedShotCount: undefined,
                pickUsed: false,
              }
            : ch,
        ),
      );
      addAdminLog(
        replaceExisting
          ? `EDIT: Lane ${laneId} plan replaced (session ${created.id}).`
          : `CREATE: Lane ${laneId} configured (session ${created.id}).`,
      );
      triggerSuccessBanner(
        replaceExisting
          ? isAr
            ? "تم حفظ التعديل."
            : "Changes saved."
          : isAr
            ? "تمت تهيئة الجلسة."
            : "Session configured.",
      );
      return true;
    } catch (err) {
      return fail(
        err,
        replaceExisting
          ? isAr
            ? "لم يتم حفظ التعديل"
            : "Changes not saved"
          : isAr
            ? "تعذّر إنشاء الجلسة"
            : "Failed to create session",
      );
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
      fail(err, isAr ? "تعذّر تعليق الجلسة" : "Could not pause session");
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
      triggerErrorBanner(
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
    // A partial bulk start is a failure report, not a confirmation — some of
    // those lanes are not running and the operator has to know which.
    triggerErrorBanner(
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
      triggerErrorBanner(
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
      fail(err, isAr ? "تعذّر الانتقال للمرحلة التالية" : "Could not advance stage");
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
      fail(err, isAr ? "تعذّر إنهاء الجلسة" : "Could not end session");
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
      fail(err, isAr ? "تعذّر إيقاف الجلسة" : "Could not stop session");
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
      // Close the lane locally right away instead of waiting on the
      // session:reviewed WS broadcast. Every other closing action
      // (stopSession, pause) updates local state as soon as its API call
      // succeeds; this one used to be the sole exception, so a missed or
      // delayed socket event left the lane showing the reviewed session
      // indefinitely — including across a refresh, since nothing had ever
      // written the vacated state to the local store or its IndexedDB
      // write-through cache. The WS event still fires and is idempotent
      // against this (toVacantLane / clearCachedShots on an already-vacant
      // lane is a no-op), so other admin consoles watching the same lane
      // still update correctly.
      void clearCachedShots(sessionId, getLaneIdFromChannelId(chId));
      setChannels((prev) =>
        prev.map((ch) => (ch.id === chId ? toVacantLane(ch) : ch)),
      );
      addAdminLog(`REVIEW: Session on Lane ${chId.replace("CH-", "")} finalized and saved.`);
      triggerSuccessBanner(
        isAr
          ? "تم حفظ التوجيهات وإنهاء الجلسة."
          : "Coach feedback saved. Lane session closed.",
      );
    } catch (err) {
      fail(err, isAr ? "لم يتم حفظ التقييم" : "Feedback not saved");
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
