import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  ClipboardList,
  Activity,
  CheckCircle,
  Wifi,
  Users,
  SkipForward,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import type { ActiveShooterChannel } from "../../../types";
import type { Session } from "../../../types";
import { formatLaneLabel, laneNeedsReview } from "../../../utils/laneSession";
import {
  targetProfileFromTargetId,
  targetProfileLabel,
} from "../../../utils/targetProfile";
import { useSessionStore } from "../../../store/sessionStore";
import { SessionTimer } from "../../shooter/components/SessionTimer";
import { InstructorFeedbackForm } from "./InstructorFeedbackForm";
import { SessionInfoCard } from "./SessionInfoCard";
import {
  SessionControlPanelProps,
  StagePlanConfig,
} from "@/src/types/session-control";
import { api, apiFetchJson } from "../../../utils/api";
import { slotCode } from "../../../utils/rangeAddressing";
import { TargetFacePreview } from "../../../components/common/TargetFacePreview";
import type { Lane, Target } from "../../../types";


/** 0 is "no clock" — see StageMonitorService, which skips those stages. */
const DURATION_PRESETS = [
  { labelEn: "Open", labelAr: "مفتوح", seconds: 0 },
  { labelEn: "5 min", labelAr: "٥ د", seconds: 300 },
  { labelEn: "10 min", labelAr: "١٠ د", seconds: 600 },
  { labelEn: "15 min", labelAr: "١٥ د", seconds: 900 },
] as const;

/**
 * Open-ended by default.
 *
 * A relay is normally run at the range officer's pace — "fire until I say
 * advance" — and a stage that quietly expires on a clock nobody asked for ends
 * a shooter's string mid-string. A time budget is the exception, so it is opted
 * into.
 */
const DEFAULT_STAGE_SECONDS = 0;

/**
 * One row of the firing plan while it is being edited.
 *
 * `bulletLimit: 0` is the in-form spelling of "unlimited", matching how the
 * lane grid and the backend's own default already express it. It is translated
 * to an ABSENT key on the way out — `CreateSessionDto` validates `@Min(1)`, so
 * posting a literal 0 is a 400.
 */
interface StageDraft {
  /** Stable across reorders so React keeps input focus. Not sent anywhere. */
  key: string;
  targetId: string;
  bulletLimit: number;
  durationSeconds: number;
}

let stageKeySeq = 0;
const newStageKey = () => `stage-${(stageKeySeq += 1)}`;

function makeStage(targetId: string): StageDraft {
  return {
    key: newStageKey(),
    targetId,
    bulletLimit: 0,
    durationSeconds: DEFAULT_STAGE_SECONDS,
  };
}

/**
 * Drop the local-only key and the 0-means-unlimited encoding.
 *
 * `bulletLimit` is OMITTED when unlimited — the API validates `@Min(1)`, so a
 * literal 0 is a 400. `durationSeconds` is sent as 0, because there its
 * `@Min(0)` accepts it and 0 is the value that means "no clock"; omitting it
 * would let the column default (600) apply and quietly put a ten-minute timer
 * on a stage the admin asked to leave open.
 */
function toStagePlan(draft: StageDraft): StagePlanConfig {
  return {
    targetId: draft.targetId,
    bulletLimit: draft.bulletLimit > 0 ? draft.bulletLimit : undefined,
    durationSeconds: draft.durationSeconds,
  };
}

function findShooterPendingReviewLane(
  shooterName: string,
  channels: ActiveShooterChannel[],
  excludeChannelId?: string,
): ActiveShooterChannel | undefined {
  const normalized = shooterName.trim().toLowerCase();
  if (!normalized) return undefined;

  return channels.find(
    (ch) =>
      ch.id !== excludeChannelId &&
      ch.sessionStatus === "COMPLETED" &&
      (ch.name.toLowerCase() === normalized ||
        ch.opId.toLowerCase() === normalized),
  );
}

/** Shape comes from the backend's ConnectedShootersService — a DEVICE that
 *  has announced itself, not a person with an account. */
type ConnectedShooter = import("../../../types").ConnectedShooter;

/**
 * One row of the firing plan while it is being edited.
 *
 * Draggable via the grip handle (Reorder.Item + useDragControls). The drag
 * handle is a separate element so interacting with the number/select inputs
 * never starts a drag, and `dragListener={false}` keeps the card's text from
 * being hijacked by pointer gestures. Defined at MODULE scope (not nested in
 * SessionControlPanel) so its component identity is stable — a nested
 * definition would remount on every render and drop focus from the inputs.
 */
const StageCard: React.FC<{
  stage: StageDraft;
  index: number;
  isAr: boolean;
  language: "en" | "ar";
  targetById: Map<string, Target>;
  canRemove: boolean;
  onPatch: (index: number, patch: Partial<StageDraft>) => void;
  onRemove: (index: number) => void;
}> = ({
  stage,
  index,
  isAr,
  language,
  targetById,
  canRemove,
  onPatch,
  onRemove,
}) => {
  const dragControls = useDragControls();
  const tgt = targetById.get(stage.targetId);

  return (
    <Reorder.Item
      as="div"
      value={stage}
      dragListener={false}
      dragControls={dragControls}
      className="p-2.5 rounded-lg border border-hud space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        {/* min-w-0 + truncate: on narrow panes the title shrinks instead of
            pushing the action buttons past the rail's overflow clip, which
            would leave the drag handle off-screen on small viewports. */}
        <div className="min-w-0 truncate admin-text-2xs font-mono font-bold uppercase tracking-wider hud-accent">
          {isAr ? `المرحلة ${index + 1}` : `Stage ${index + 1}`}
          {tgt ? (
            <span className="hud-text-muted font-normal normal-case tracking-normal ms-2">
              {targetProfileLabel(tgt.profileType, language)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onPointerDown={(e) => dragControls.start(e)}
            title={isAr ? "اسحب لإعادة الترتيب" : "Drag to reorder"}
            aria-label={isAr ? "إعادة ترتيب المرحلة" : "Reorder stage"}
            className="p-1.5 rounded cursor-grab active:cursor-grabbing touch-none bg-hud-elevated border border-hud hud-text-secondary hover:text-hud-accent hover:border-hud-strong transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              title={isAr ? "حذف المرحلة" : "Remove stage"}
              className="p-1.5 rounded hud-danger hover:bg-[var(--hud-danger-bg)] cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* The face beside the target, so a stage aimed at the
          wrong scoring rings is caught before the relay runs
          rather than after it is scored. The target itself is
          fixed by the SUPER_ADMIN's lane configuration — the
          admin sequences how many stages to run, not which
          target each one engages. */}
      <div className="flex items-center gap-2">
        {tgt && (
          <TargetFacePreview
            profileType={tgt.profileType}
            size={52}
            title={`${slotCode(tgt.laneId, tgt.positionIndex)} · ${tgt.distanceM}m`}
            className="hud-text-subtle"
          />
        )}
        <div className="flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-hud bg-hud-elevated">
          {tgt ? (
            <>
              <span className="admin-text-xs font-mono font-bold hud-accent uppercase tracking-wider">
                {slotCode(tgt.laneId, tgt.positionIndex)} ·{" "}
                {tgt.distanceM}m
              </span>
              <span className="admin-text-2xs font-mono hud-text-muted block truncate">
                {tgt.label} ·{" "}
                {targetProfileLabel(tgt.profileType, language)}
              </span>
            </>
          ) : (
            <span className="admin-text-2xs font-mono hud-warning">
              {isAr ? "هدف غير متاح" : "Target unavailable"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block hud-text-subtle mb-1 font-mono uppercase admin-text-2xs">
            {isAr ? "عدد الطلقات" : "Bullets"}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={999}
              value={stage.bulletLimit}
              onChange={(e) =>
                onPatch(index, {
                  bulletLimit: Math.max(
                    0,
                    Math.min(999, Number(e.target.value)),
                  ),
                })
              }
              className="w-16 px-1.5 py-1.5 border rounded text-center hud-form-input"
            />
            {/* 0 is not a magic sentinel the admin has to know:
                it is spelled out right next to the field. */}
            <span className="admin-text-2xs hud-text-muted italic leading-tight">
              {stage.bulletLimit > 0
                ? isAr
                  ? "تنتهي المرحلة عند بلوغه"
                  : "stage ends at this count"
                : isAr
                  ? "0 = غير محدود"
                  : "0 = unlimited"}
            </span>
          </div>
        </div>
        <div>
          <label className="block hud-text-subtle mb-1 font-mono uppercase admin-text-2xs">
            {isAr ? "المدة" : "Time"}
          </label>
          <select
            value={stage.durationSeconds}
            onChange={(e) =>
              onPatch(index, { durationSeconds: Number(e.target.value) })
            }
            title={
              stage.durationSeconds === 0
                ? isAr
                  ? "بلا مؤقّت — تنتهي المرحلة عند انتقالك أو ببلوغ عدد الطلقات"
                  : "No timer — the stage ends when you advance it, or at the bullet count"
                : undefined
            }
            className="w-full px-2 py-1.5 rounded admin-text-2xs font-mono border hud-form-input cursor-pointer"
          >
            {DURATION_PRESETS.map((p) => (
              <option key={p.seconds} value={p.seconds}>
                {isAr ? p.labelAr : p.labelEn}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Says out loud what will actually end this stage. The
          three combinations behave differently and none of it
          is visible from the controls alone. */}
      <p className="admin-text-2xs font-mono hud-text-subtle leading-snug">
        {stage.bulletLimit > 0
          ? isAr
            ? `تنتهي تلقائياً بعد ${stage.bulletLimit} طلقة${stage.durationSeconds > 0 ? " أو بانتهاء الوقت" : ""} — ثم تبدأ المرحلة التالية.`
            : `Ends itself after ${stage.bulletLimit} round${stage.bulletLimit === 1 ? "" : "s"}${stage.durationSeconds > 0 ? " (or when time runs out)" : ""}, then arms the next stage.`
          : stage.durationSeconds > 0
            ? isAr
              ? "تنتهي بانتهاء الوقت — ثم تبدأ المرحلة التالية."
              : "Ends when the clock runs out, then arms the next stage."
            : isAr
              ? "تعمل حتى تضغط «المرحلة التالية»."
              : "Runs until you press Next Stage."}
      </p>
    </Reorder.Item>
  );
};

export const SessionControlPanel: React.FC<SessionControlPanelProps> = ({
  channel: channelProp,
  channels: channelsProp,
  setSelectedChannelId,
  onCreateSession,
  onPauseSession,
  onResumeSession,
  onEndSession,
  onAdvanceSession,
  onDiscardSession,
  onSaveFeedback,
  onCancelSession,
  language,
  t,
  availableShooters,
  variant = "default",
}) => {
  const isAr = language === "ar";
  const isHud = variant === "hud";

  const storeChannels = useSessionStore((s) => s.channels);
  const channels = storeChannels;
  const channel = channelProp
    ? (storeChannels.find((ch) => ch.id === channelProp.id) ?? channelProp)
    : undefined;
  const btnPrimary = isHud
    ? "hud-btn-primary py-2.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
    : "hud-btn-primary py-2.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors";
  const btnSecondary = isHud
    ? "hud-btn-secondary py-2 cursor-pointer transition-colors"
    : "hud-btn-secondary py-2 cursor-pointer transition-colors";
  const btnWarn = isHud
    ? "hud-btn-warn py-2 cursor-pointer transition-colors"
    : "hud-btn-warn py-2 cursor-pointer transition-colors";
  const btnPause = isHud
    ? "hud-btn-pause py-2 cursor-pointer transition-colors flex items-center justify-center gap-1.5"
    : "hud-btn-pause py-2 cursor-pointer transition-colors flex items-center justify-center gap-1.5";

  // Setup form
  const [shooterName, setShooterName] = useState("");
  // Targets are READ here, never created or edited: this lane's hardware is
  // whatever SUPER_ADMIN commissioned on the Lane Hardware screen. The admin's
  // job is to sequence them, not to define them.
  const [laneTargets, setLaneTargets] = useState<Target[]>([]);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  // The firing plan: stages fire in array order, each against its own target
  // with its own bullet count and clock.
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  /** In-flight guard for the create/save request. The submit buttons were
   *  freely re-clickable while a POST was outstanding, and each click created
   *  another session on the lane. */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectedShooters, setConnectedShooters] = useState<
    ConnectedShooter[]
  >([]);
  /** Last session whose stage plan was pre-rendered into the form, so the
   *  realtime-driven re-runs of the seed effect below don't refetch (and
   *  clobber edits) on every shot/state tick. */
  const seededSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    setIsEditing(false);
  }, [channel?.id]);

  // The stage plan can only reference targets that are actually commissioned
  // on this lane — the backend rejects anything else with a 400.
  useEffect(() => {
    if (!channel?.id) return;
    const laneId = parseInt(channel.id.replace("CH-", ""), 10);
    if (Number.isNaN(laneId)) return;
    let cancelled = false;
    setTargetsLoaded(false);
    void api
      .get<Lane>(`/lanes/${laneId}`)
      .then((lane) => {
        if (cancelled) return;
        const targets = [...(lane.targets ?? [])].sort(
          (a, b) => a.positionIndex - b.positionIndex,
        );
        setLaneTargets(targets);
        setTargetsLoaded(true);
        // Drop any stage aimed at a target this lane no longer has — a
        // SUPER_ADMIN may have deleted or re-homed it since the form was
        // opened, and posting it would 400.
        setStages((prev) => {
          const live = prev.filter((s) =>
            targets.some((t) => t.id === s.targetId),
          );
          if (live.length > 0) return live;
          // Fresh plan: one stage per commissioned target, in lane order.
          // Stage i engages the lane's i-th target, so the whole firing plan
          // is laid out up front.
          return targets.map((t) => makeStage(t.id));
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLaneTargets([]);
        setTargetsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [channel?.id]);

  // ── Stage plan editing ────────────────────────────────────────────────────

  const patchStage = (index: number, patch: Partial<StageDraft>) =>
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );

  /** Default a new stage to the first commissioned target NOT already in the
   *  plan. Originally this picked `laneTargets[prev.length]` — which is only
   *  valid while the plan stays in lane order. Once the admin drags stages
   *  around, position and target drift apart, so look up by "not used yet"
   *  instead: the plan still has one stage per commissioned target, just in
   *  whatever order the admin arranged. */
  const addStage = () =>
    setStages((prev) => {
      if (laneTargets.length === 0) return prev;
      const used = new Set(prev.map((s) => s.targetId));
      const next = laneTargets.find((t) => !used.has(t.id));
      // Can only build one stage per commissioned target.
      if (!next) return prev;
      return [...prev, makeStage(next.id)];
    });

  // A session with no stages cannot be created, so the last one is never
  // removable — the button is hidden rather than disabled at length 1.
  const removeStage = (index: number) =>
    setStages((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );

  useEffect(() => {
    void fetchConnectedShooters();
    const interval = setInterval(fetchConnectedShooters, 5000);
    return () => clearInterval(interval);
  }, []);

  // apiFetchJson, not a bare fetch: this route is requireAuth + requireRole
  // ("ADMIN"), so a token-less request 401s every time. The old bare fetch
  // checked `data.ok`, silently swallowed the 401, and left this list
  // permanently empty.
  const fetchConnectedShooters = async () => {
    try {
      const rows = await apiFetchJson<ConnectedShooter[]>(
        "/api/auth/connected-shooters",
        { signal: AbortSignal.timeout(3000) },
      );
      setConnectedShooters(Array.isArray(rows) ? rows : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!channel) return;

    if (isEditing) return; // Don't overwrite form if we're currently editing

    if (channel.sessionStatus !== "NONE" && channel.name !== "Vacant Lane") {
      setShooterName(channel.name);
    } else {
      setShooterName("");
    }
    setNotes(channel.sessionStatus !== "NONE" ? channel.notes || "" : "");

    // Pre-render the existing stages when a session already exists on this
    // lane. The lane grid only carries the LIVE stage, so a full round-trip to
    // GET /sessions/:id is required to reconstruct the whole plan — this lets
    // "Edit Config" open with every stage already in place. Keyed on the
    // session id so realtime ticks don't refetch or clobber the form.
    const sessionId = channel.sessionId;
    if (
      channel.sessionStatus !== "NONE" &&
      sessionId &&
      seededSessionIdRef.current !== sessionId
    ) {
      seededSessionIdRef.current = sessionId;
      void api
        .get<Session>(`/sessions/${sessionId}`)
        .then((session) => {
          if (seededSessionIdRef.current !== sessionId) return;
          // Notes come off the SERVER's copy, not the lane grid's. Now that
          // they are actually persisted, an admin console that never issued
          // the create (a second device, or this one after a reload) has no
          // other source for them — and re-saving a plan whose notes field had
          // been seeded blank would have wiped the stored text.
          if (session?.notes != null) setNotes(session.notes);
          if (!session?.stages?.length) return;
          const ordered = [...session.stages].sort(
            (a, b) => a.order - b.order,
          );
          setStages(
            ordered.map((s) => ({
              key: newStageKey(),
              targetId: s.targetId,
              bulletLimit: s.bulletLimit,
              durationSeconds: s.durationSeconds,
            })),
          );
        })
        .catch(() => {
          /* keep whatever the live grid gave us */
        });
    } else if (channel.sessionStatus !== "NONE" && channel.targetName) {
      setStages([
        {
          key: newStageKey(),
          targetId: channel.targetName,
          bulletLimit: channel.bulletLimit ?? 0,
          durationSeconds: channel.durationSeconds ?? DEFAULT_STAGE_SECONDS,
        },
      ]);
    }
  }, [channel, isEditing, availableShooters]);

  if (!channel) {
    return (
      <div className="p-4 text-center admin-text-xs hud-text-subtle font-mono">
        {isAr
          ? "الرجاء اختيار حارة للتحكم بالجلسة"
          : "Select a lane to manage session"}
      </div>
    );
  }

  const status = channel.sessionStatus;
  const shooterPendingLane = shooterName.trim()
    ? findShooterPendingReviewLane(shooterName, channels, channel.id)
    : undefined;
  const createBlockedReason = shooterPendingLane
    ? isAr
      ? `الرامي ${shooterName} لديه جولة مكتملة (لم يتم حفظها) على ${formatLaneLabel(shooterPendingLane.id, "ar")}. قم بحفظ التقييم أو تجاهل الجلسة أولاً.`
      : `${shooterName} has a completed session (not saved yet) on ${formatLaneLabel(shooterPendingLane.id)}. Save feedback or discard it first before assigning this shooter.`
    : null;

  const targetById = new Map(laneTargets.map((tgt) => [tgt.id, tgt]));
  /** Display only. The lane grid shows one distance, so it shows the first
   *  stage's — the rest are visible in the plan itself. */
  const planDistance = (() => {
    const first = stages[0] && targetById.get(stages[0].targetId);
    return first ? `${first.distanceM}m` : channel.distance;
  })();
  const planIsValid =
    stages.length > 0 && stages.every((s) => targetById.has(s.targetId));

  /**
   * Submit the plan and report whether the SERVER took it.
   *
   * onCreateSession resolves to false on any rejection — a lane that already
   * has a running session, a target that moved to another lane, an expired
   * token, the backend being unreachable. Callers must gate on the result;
   * nothing here may assume success.
   */
  const submitPlan = async (): Promise<boolean> => {
    if (isSubmitting) return false;
    setIsSubmitting(true);
    try {
      return await onCreateSession({
        shooterName,
        stages: stages.map(toStagePlan),
        notes,
        distance: planDistance,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── SETUP PANEL: no session yet OR editing session ──────────────────────────
  if (status === "NONE" || !status || isEditing) {
    const currentLaneId = parseInt(channel.id.replace("CH-", ""), 10);
    const laneConnectedShooters = connectedShooters.filter(
      (s) => s.laneId === currentLaneId,
    );
    return (
      <div className="space-y-4">
        <h4 className="font-mono admin-text-xs font-bold hud-text-muted uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
          <ClipboardList className="w-4 h-4 hud-accent" />
          {isEditing
            ? isAr
              ? "تعديل تهيئة الجلسة"
              : "Edit Session Configuration"
            : isAr
              ? "إعداد جولة الرماية"
              : "Configure Shooting Session"}
        </h4>

        {laneConnectedShooters.length > 0 && (
          <div className="p-3 hud-accent-bg-subtle border border-hud rounded-xl space-y-2">
            <p className="font-mono admin-text-2xs hud-accent uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              {isAr ? "رامون متصلون" : "Connected Shooters"}
            </p>
            {laneConnectedShooters.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 font-mono admin-text-2xs"
              >
                <Wifi className="w-3 h-3 hud-accent/60 shrink-0" />
                <span className="hud-text-secondary">{s.ip}</span>
                <span className="hud-text-muted">→</span>
                <span className="hud-success">
                  {isAr ? `حارة ${s.laneId}` : `Lane ${s.laneId}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 admin-text-xs" dir={isAr ? "rtl" : "ltr"}>
          <div>
            <label className="block hud-text-subtle mb-1 font-mono uppercase admin-text-2xs">
              {isAr ? "الحارة المستهدفة" : "Target Lane"}
            </label>
<select
                value={channel.id}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="w-full px-2 py-1.5 border rounded-lg hud-form-input"
              >
              {channels.map((ch, idx) => (
                <option key={ch.id} value={ch.id}>
                  {isAr ? `حارة ${idx + 1}` : `Lane 0${idx + 1}`} (
                  {laneNeedsReview(ch.sessionStatus)
                    ? isAr
                      ? "بانتظار المراجعة"
                      : "Awaiting review"
                    : ch.sessionStatus === "NONE"
                      ? isAr
                        ? "شاغرة"
                        : "Vacant"
                      : ch.name}
                  )
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block hud-text-subtle mb-1 font-mono uppercase admin-text-2xs">
              {isAr ? "اسم المستخدم" : "Username"}
            </label>
            {availableShooters.length > 0 ? (
              <select
                value={shooterName}
                onChange={(e) => setShooterName(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg hud-form-input"
              >
                <option value="">
                  {isAr ? "— اختر رامياً —" : "— Select shooter —"}
                </option>
                {availableShooters.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={shooterName}
                onChange={(e) => setShooterName(e.target.value)}
                placeholder={isAr ? "shooter1" : "shooter1"}
                className="w-full px-3 py-1.5 border rounded-lg hud-form-input"
              />
            )}
          </div>

          {/* ── FIRING PLAN ────────────────────────────────────────────────
              The targets listed here are exactly what SUPER_ADMIN commissioned
              on this lane. This screen cannot add, rename or re-address one —
              it only decides which of them get fired, in what order, and for
              how many rounds and how long each. */}
          <div>
            <div className="flex items-end justify-between mb-1 gap-2">
              <label className="block hud-text-subtle font-mono uppercase admin-text-2xs">
                {isAr ? "خطة الرماية" : "Firing Plan"}
              </label>
              <span className="admin-text-2xs font-mono hud-text-muted">
                {isAr
                  ? `${stages.length} مرحلة`
                  : `${stages.length} stage${stages.length === 1 ? "" : "s"}`}
              </span>
            </div>

            {targetsLoaded && laneTargets.length === 0 ? (
              <div className="px-3 py-4 rounded-lg border border-dashed border-hud text-center">
                <p className="admin-text-2xs font-mono hud-warning leading-relaxed">
                  {isAr
                    ? "لا توجد أهداف مركّبة على هذه الحارة. يجب على المشرف الأعلى تهيئتها أولاً."
                    : "No targets are commissioned on this lane. A super admin must add them on the Lane Hardware screen before a session can run here."}
                </p>
              </div>
            ) : (
              <Reorder.Group
                axis="y"
                values={stages}
                onReorder={setStages}
                className="space-y-2"
              >
                {stages.map((stage, index) => (
                  <StageCard
                    key={stage.key}
                    stage={stage}
                    index={index}
                    isAr={isAr}
                    language={language}
                    targetById={targetById}
                    canRemove={stages.length > 1}
                    onPatch={patchStage}
                    onRemove={removeStage}
                  />
                ))}

                <button
                  type="button"
                  onClick={addStage}
                  disabled={
                    laneTargets.length === 0 ||
                    stages.length >= laneTargets.length
                  }
                  className="inline-flex items-center gap-1.5 admin-text-2xs font-mono hud-accent cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  {isAr ? "إضافة مرحلة" : "Add another stage"}
                </button>
              </Reorder.Group>
            )}
          </div>

          <div>
            <label className="block hud-text-subtle mb-1 font-mono uppercase admin-text-2xs">
              {isAr ? "ملاحظات الجلسة" : "Session Notes"}
            </label>
<input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  isAr
                    ? "مثال: اتجاه الرياح، تفاصيل الوضعية"
                    : "e.g. Wind direction, body positioning"
                }
                className="w-full px-3 py-1.5 border rounded-lg hud-form-input"
              />
          </div>

          {createBlockedReason && (
            <p className="admin-text-2xs hud-warning font-mono hud-warning-bg border border-hud rounded-lg p-2.5">
              {createBlockedReason}
            </p>
          )}

          {isEditing ? (
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className={`flex-1 admin-text-xs ${btnSecondary}`}
              >
                {isAr ? "إلغاء التعديل" : "Cancel Edit"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  // Close ONLY on a confirmed write.
                  //
                  // This used to be `submitPlan(); setIsEditing(false);` — a
                  // floating promise followed by an unconditional close. The
                  // panel collapsed and the grid showed the edited plan even
                  // when the request was refused, so "saved" and "silently
                  // discarded" looked identical until the next reload put the
                  // old plan back. Staying open on failure keeps the operator's
                  // work on screen next to the banner explaining why.
                  const saved = await submitPlan();
                  if (saved) setIsEditing(false);
                }}
                disabled={
                  isSubmitting ||
                  !shooterName.trim() ||
                  !planIsValid ||
                  !!shooterPendingLane
                }
                className={`flex-1 admin-text-xs ${btnPrimary}`}
              >
                {isSubmitting
                  ? isAr
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : isAr
                    ? "حفظ التعديل"
                    : "Save Changes"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => void submitPlan()}
              disabled={
                isSubmitting ||
                !shooterName.trim() ||
                !planIsValid ||
                !!shooterPendingLane
              }
              className={`w-full mt-2 ${btnPrimary}`}
            >
              {isSubmitting
                ? isAr
                  ? "جارٍ التهيئة…"
                  : "Configuring…"
                : isAr
                  ? "تهيئة وتعيين الجلسة"
                  : "Create Session"}
            </button>
          )}
        </div>
      </div>
    );
  }

   // ── CREATED: session configured, waiting to go ACTIVE ───────────────────
   if (status === "CREATED" && !isEditing) {
     return (
       <div className="space-y-4">
         <h4 className="font-mono admin-text-xs font-bold hud-text-muted uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
           <Activity className="w-4 h-4 hud-warning" />
          {isAr
            ? "الجلسة مُعدّة — في انتظار الإطلاق"
            : "Session Ready — Awaiting Start"}
        </h4>

        <SessionInfoCard channel={channel} isAr={isAr} isHud={isHud} />

        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className={`flex-1 py-2.5 admin-text-xs ${btnSecondary}`}
          >
            {isAr ? "تعديل الجلسة" : "Edit Config"}
          </button>
          <button
            onClick={onDiscardSession}
            className={`flex-1 py-2.5 admin-text-xs ${btnWarn}`}
          >
            {isAr ? "إلغاء الجلسة" : "Discard"}
          </button>
        </div>

        <button
          onClick={onResumeSession}
          className={`w-full mt-1 flex items-center justify-center gap-1.5 admin-text-xs ${btnPrimary}`}
        >
          <Play className="w-4 h-4" />
          {isAr ? "بدء الجلسة" : "Activate Session"}
        </button>
      </div>
    );
  }

  // ── ACTIVE / PAUSED: session in progress ─────────────────────────────────
  if (status === "ACTIVE" || status === "PAUSED") {
    // 0-based order, so the last stage is stageCount - 1.
    const isMultiStage = (channel.stageCount ?? 0) > 1;
    const hasNextStage =
      isMultiStage &&
      channel.activeStageOrder != null &&
      channel.activeStageOrder < (channel.stageCount ?? 0) - 1;

    return (
      <div className="space-y-4">
       <h4 className="font-mono admin-text-xs font-bold hud-text-muted uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
           <Activity
             className={`w-4 h-4 hud-accent ${status === "ACTIVE" ? "animate-pulse" : ""}`}
           />
          {isAr ? "التحكم بالجلسة النشطة" : "Active Session Control"}
        </h4>

        <SessionInfoCard channel={channel} isAr={isAr} isHud={isHud} />

        {(status === "ACTIVE" ||
          status === "PAUSED" ||
          status === "COMPLETED" ||
          status === "REVIEWED") && (
          <SessionTimer
            startTime={channel.startTime}
            endTime={channel.endTime}
            durationSeconds={channel.durationSeconds}
            totalPausedMs={channel.totalPausedMs}
            remainingSeconds={channel.remainingSeconds}
            sessionStatus={channel.sessionStatus}
            language={language}
            variant={isHud ? "rail" : "default"}
          />
        )}

        {/* Progress shows for every multi-stage relay, including its LAST
            stage — "Stage 4 of 4" is exactly when an officer wants to know
            where they are. Only the advance BUTTON is conditional: a final
            stage has nothing to advance to, and advancing would just end the
            session, which is what End Session is for. */}
        {isMultiStage && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-hud bg-hud-elevated">
            <span className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider">
              {isAr
                ? `المرحلة ${(channel.activeStageOrder ?? 0) + 1} من ${channel.stageCount}`
                : `Stage ${(channel.activeStageOrder ?? 0) + 1} of ${channel.stageCount}`}
              {channel.bulletLimit ? (
                <span className="normal-case tracking-normal ms-2">
                  {isAr
                    ? `· ${channel.bulletLimit} طلقة`
                    : `· ${channel.bulletLimit} rds`}
                </span>
              ) : null}
            </span>
            {hasNextStage ? (
              <button
                onClick={() => onAdvanceSession?.(channel.id)}
                disabled={status !== "ACTIVE"}
                title={
                  isAr
                    ? "إنهاء هذه المرحلة والانتقال للتالية"
                    : "End this stage now and arm the next target"
                }
                className={`admin-text-2xs px-2.5 py-1.5 ${btnSecondary} flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <SkipForward className="w-3.5 h-3.5" />
                {isAr ? "المرحلة التالية" : "Next Stage"}
              </button>
            ) : (
              <span className="admin-text-2xs font-mono hud-text-subtle">
                {isAr ? "المرحلة الأخيرة" : "Final stage"}
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {status === "ACTIVE" ? (
            <button
              onClick={onPauseSession}
              className={`flex-1 admin-text-xs ${btnPause}`}
            >
              <Pause className="w-4 h-4" />
              {isAr ? "تعليق الجلسة" : "Pause Session"}
            </button>
          ) : (
            <button
              onClick={onResumeSession}
              className={`flex-1 admin-text-base ${btnPrimary} flex items-center justify-center gap-1.5`}
            >
              <Play className="w-4 h-4" />
              {isAr ? "استئناف الجلسة" : "Resume Session"}
            </button>
          )}

          <button
            onClick={onEndSession}
            className={`flex-1 admin-text-xs ${btnWarn} flex items-center justify-center gap-1.5`}
          >
            <Square className="w-3.5 h-3.5" />
            {isAr ? "إنهاء الجلسة" : "End Session"}
          </button>
        </div>
      </div>
    );
  }

  // ── COMPLETED: session done, show feedback form ───────────────────────────
  if (status === "COMPLETED") {
    return (
      <div className="space-y-3">
        <InstructorFeedbackForm
          key={channel.id}
          language={language}
          onSave={onSaveFeedback}
          onCancel={onCancelSession}
          onDiscard={onDiscardSession}
        />
        <button
          onClick={onDiscardSession}
          className={`w-full mt-1 ${btnPrimary} flex items-center justify-center gap-1.5`}
        >
          {isAr ? "بدء جلسة جديدة" : "Start New Session"}
        </button>
      </div>
    );
  }

  // ── CANCELLED: session fully closed ────────────────────────────────────────
  // There is no REVIEWED status any more — a reviewed session is COMPLETED
  // with `reviewedAt` set, since a scorecard does not stop being valid just
  // because a coach has looked at it.
  if (status === "CANCELLED") {
    return (
      <div className="space-y-3">
         <h4 className="font-mono admin-text-xs font-bold hud-text-muted uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
           <CheckCircle className="w-4 h-4 hud-accent" />
          {status === "CANCELLED"
            ? isAr
              ? "تم إلغاء الجلسة وحفظها"
              : "Session Cancelled & Saved"
            : isAr
              ? "تم إغلاق الجلسة وحفظها"
              : "Session Reviewed & Closed"}
        </h4>
         <div
           className={`p-3 rounded-xl admin-text-xs font-mono text-center ${
             isHud
               ? "hud-info-card !text-[#00FFD1]"
               : "hud-info-card !text-[#00FFD1]"
           }`}
         >
          {isAr
            ? "الحارة جاهزة للجلسة التالية."
            : "Lane is ready for the next shooter."}
        </div>
      </div>
    );
  }

  return null;
};
