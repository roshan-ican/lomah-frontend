import React from "react";
import { Radio, Activity } from "lucide-react";
import { TranslationSet } from "../../../translations";
import {
  ActiveShooterChannel as ActiveChannel,
  LaneScheduleView,
} from "../../../types";
import {
  laneHasSession,
  shotsForLaneDisplay,
} from "../../../utils/laneSession";
import {
  targetProfileLabel,
  targetProfileFromTargetId,
} from "../../../utils/targetProfile";
import { useSessionStore } from "../../../store/sessionStore";
import { SessionTimer } from "../../shooter/components/SessionTimer";
import { getLaneIdFromChannelId } from "../../../utils/helper";

interface ActiveLanesProps {
  channels: ActiveChannel[];
  activeLaneSchedules: LaneScheduleView[];
  selectedChannelId: string;
  setSelectedChannelId: (id: string) => void;
  onEnterLane?: (channelId: string) => void;
  onViewLaneDetail?: (channelId: string) => void;
  handleAdminCommand: (
    channelId: string,
    cmd: "PAUSE" | "RESUME" | "RESET",
  ) => void;
  onEndSession: (channelId: string) => void;
  language: "en" | "ar";
  t: TranslationSet;
  variant?: "default" | "command";
}

function reservationBadge(isAr: boolean): { label: string; className: string } {
  return {
    label: isAr ? "محجوزة" : "SCHEDULED",
    className: "hud-status-paused",
  };
}

function reservationTime(schedule: LaneScheduleView, isAr: boolean): string {
  const formatter = new Intl.DateTimeFormat(isAr ? "ar" : "en", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(schedule.startsAt))}–${formatter.format(new Date(schedule.endsAt))}`;
}

function statusMeta(
  status: ActiveChannel["sessionStatus"],
  isAr: boolean,
): { label: string; color: string; dot: string } {
  switch (status) {
    case "ACTIVE":
      return {
        label: isAr ? "نشط" : "ACTIVE",
        color: "hud-status-active",
        dot: "bg-[var(--hud-success)] shadow-[var(--hud-shadow-live)]",
      };
    case "CREATED":
      return {
        label: isAr ? "جاهز" : "READY",
        color: "hud-status-ready",
        dot: "bg-[var(--hud-accent)]",
      };
    case "PAUSED":
      return {
        label: isAr ? "معلق" : "PAUSED",
        color: "hud-status-paused",
        dot: "bg-[var(--hud-warning)]",
      };
    case "COMPLETED":
      return {
        label: isAr ? "منتهية" : "DONE",
        color: "hud-status-done",
        dot: "bg-[var(--hud-warning)]",
      };
    default:
      return {
        label: isAr ? "متاحة" : "AVAILABLE",
        color: "hud-status-vacant",
        dot: "bg-[var(--hud-text-subtle)]",
      };
  }
}

function laneStatusBadge(
  laneStatus: string | undefined,
  isAr: boolean,
): { label: string; className: string } {
  switch (laneStatus) {
    case "ACTIVE":
      return {
        label: isAr ? "نشطة" : "IN USE",
        className: "hud-status-active",
      };
    case "CONFIGURED":
      return {
        label: isAr ? "مُعدّة" : "CONFIGURED",
        className: "hud-status-ready",
      };
    case "PAUSED":
      return {
        label: isAr ? "متوقفة" : "PAUSED",
        className: "hud-status-paused",
      };
    case "COMPLETED":
      return {
        label: isAr ? "منتهية" : "COMPLETED",
        className: "hud-status-done",
      };
    case "AVAILABLE":
    default:
      return {
        label: isAr ? "شاغرة" : "AVAILABLE",
        className: "hud-status-vacant",
      };
  }
}

export const ActiveLanes: React.FC<ActiveLanesProps> = ({
  channels: channelsProp,
  activeLaneSchedules,
  selectedChannelId,
  setSelectedChannelId,
  onEnterLane,
  onViewLaneDetail,
  handleAdminCommand,
  onEndSession,
  language,
  t,
  variant = "default",
}) => {
  const isAr = language === "ar";
  const isCommand = variant === "command";

  const storeChannels = useSessionStore((s) => s.channels);
  const channels = storeChannels;

  const activeScheduleFor = (ch: ActiveChannel) =>
    activeLaneSchedules.find(
      (schedule) => schedule.laneId === getLaneIdFromChannelId(ch.id),
    );

  const shooterLabel = (
    ch: ActiveChannel,
    schedule?: LaneScheduleView,
  ) => {
    if (ch.name && ch.name !== "Vacant Lane" && ch.name !== "Guest Shooter") {
      return ch.name;
    }
    if (ch.opId && ch.opId !== "VACANT" && ch.opId !== "GUEST") {
      return ch.opId;
    }
    if (schedule?.access === "OWNER") {
      const [first, ...rest] = schedule.attendees;
      if (first) {
        return rest.length > 0
          ? `${first.displayName} +${rest.length}`
          : first.displayName;
      }
      return isAr ? "مجموعة مجدولة" : "Scheduled group";
    }
    if (schedule?.access === "BUSY") {
      return isAr ? "حجز خاص" : "Reserved";
    }
    return isAr ? "غير معيّن" : "Unassigned";
  };

  const liveFiringCount = channels.filter(
    (ch) => ch.sessionStatus === "ACTIVE",
  ).length;
  const readyCount = channels.filter(
    (ch) => ch.sessionStatus === "CREATED",
  ).length;

  const handleLaneClick = (chId: string) => {
    setSelectedChannelId(chId);
    onEnterLane?.(chId);
  };

  if (isCommand) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="hud-label hud-accent flex items-center gap-1.5 admin-text-2xs">
              <Radio className="w-3 h-3" />
              {isAr ? "مركز قيادة الحارات" : "RANGE COMMAND CENTER"}
            </h2>
            <p className="font-mono admin-text-2xs hud-text-muted mt-1">
              {isAr
                ? "اضغط على حارة لتعيين الرامي أو متابعة الرماية المباشرة"
                : "Tap a lane to assign a shooter or monitor live fire"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {liveFiringCount > 0 && (
              <span className="hud-label flex items-center gap-1.5 hud-success px-3 py-1 rounded-full hud-glass">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                {liveFiringCount} {isAr ? "مباشر" : "LIVE"}
              </span>
            )}
            {readyCount > 0 && (
              <span className="hud-label hud-accent px-3 py-1">
                {readyCount} {isAr ? "جاهز" : "READY"}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 md:gap-3">
          {channels.map((ch, idx) => {
            const hasSession = laneHasSession(ch.sessionStatus);
            const reservation = hasSession ? undefined : activeScheduleFor(ch);
            const laneBadge = reservation
              ? reservationBadge(isAr)
              : laneStatusBadge(ch.laneStatus, isAr);
            const visibleShots = shotsForLaneDisplay(
              ch.sessionStatus,
              ch.shots,
            );
            const totalLaneScore = hasSession
              ? visibleShots.reduce((sum, s) => sum + s.score, 0)
              : 0;
            const isLive = ch.sessionStatus === "ACTIVE";
            const status = statusMeta(ch.sessionStatus, isAr);
            const bulletsLabel = !hasSession
              ? "—"
              : ch.bulletLimit && ch.bulletLimit > 0
                ? `${visibleShots.length}/${ch.bulletLimit}`
                : `${visibleShots.length}`;
            const laneNum = String(idx + 1).padStart(2, "0");

            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleLaneClick(ch.id)}
                className={`group text-left flex flex-col transition-all cursor-pointer rounded-lg border bg-hud-elevated overflow-hidden ${
                  isLive
                    ? "border-[var(--hud-success)]/60"
                    : selectedChannelId === ch.id
                      ? "border-[var(--hud-accent)]"
                      : "border-hud hover:bg-[var(--hud-accent-bg-subtle)]"
                }`}
              >
                <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-hud">
                  <div className="min-w-0">
                    <div className="hud-label hud-accent truncate">
                      {isAr ? `حارة ${laneNum}` : `LANE ${laneNum}`}
                    </div>
                    <div className="range-rail-meta truncate">
                      {shooterLabel(ch, reservation)}
                    </div>
                  </div>
                  <div className="text-right font-mono admin-text-2xs shrink-0">
                    {hasSession && ch.sessionStatus !== "CREATED" && (
                      <div className={isLive ? "hud-success" : "hud-text-subtle"}>
                        {status.label}
                      </div>
                    )}
                    <div className="hud-accent tabular-nums">
                      {bulletsLabel} · {hasSession ? totalLaneScore : "—"}
                    </div>
                    <div
                      className={`mt-1 inline-block px-1.5 py-0.5 rounded admin-text-2xs font-bold border ${laneBadge.className}`}
                    >
                      {laneBadge.label}
                    </div>
                  </div>
                </div>

                <div className="p-2.5">
                  <div className="grid grid-cols-3 gap-1.5 mb-2 font-mono text-center">
                    <div>
                      <span className="hud-label block hud-text-subtle mb-0.5">
                        {isAr ? "ذخيرة" : "AMMO"}
                      </span>
                      <span
                        className={`admin-text-sm font-bold tabular-nums ${
                          isLive ? "hud-success" : "hud-text"
                        }`}
                      >
                        {bulletsLabel}
                      </span>
                    </div>
                    <div>
                      <span className="hud-label block hud-text-subtle mb-0.5">
                        {isAr ? "وقت" : "TIME"}
                      </span>
                      <SessionTimer
                        startTime={ch.startTime}
                        endTime={ch.endTime}
                        durationSeconds={ch.durationSeconds}
                        totalPausedMs={ch.totalPausedMs}
                        remainingSeconds={ch.remainingSeconds}
                        sessionStatus={ch.sessionStatus}
                        language={language}
                        compact
                      />
                    </div>
                    <div>
                      <span className="hud-label block hud-text-subtle mb-0.5">
                        {isAr ? "نتيجة" : "SCORE"}
                      </span>
                      <span className="admin-text-sm font-bold hud-accent tabular-nums">
                        {hasSession ? totalLaneScore : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between admin-text-2xs font-mono hud-text-subtle">
                    <span>
                      {reservation
                        ? `${reservationTime(reservation, isAr)} • ${isAr ? "حجز نشط" : "Active reservation"}`
                        : `${targetProfileLabel(
                            targetProfileFromTargetId(ch.targetName),
                            language,
                          )} • ${ch.distance}`}
                    </span>
                    {isLive && (
                      <span className="hud-success uppercase tracking-wider">
                        ● {isAr ? "مباشر" : "Live"}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
<div className="flex items-center justify-between border-b border-hud pb-3">
         <div>
            <h2 className="admin-text-lg font-bold tracking-tight hud-text flex items-center gap-2">
             <Radio className="w-5 h-5 hud-accent animate-pulse" />
             {t.liveCommandGrid}
           </h2>
           <p className="admin-text-xs hud-text-muted font-mono mt-1">
             {isAr
               ? "اضغط على الحارة لاستهداف لوحة المعاينة ومتابعة رشق الرامي."
               : "Click lane to focus preview and follow shooter metrics."}
           </p>
         </div>
         <div className="flex flex-wrap items-center gap-2 justify-end">
           {liveFiringCount > 0 && (
             <span className="font-mono admin-text-xs hud-success px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
               <Activity className="w-3.5 h-3.5" />
               {liveFiringCount} {isAr ? "حارة ترصد الآن" : "LIVE FIRING"}
             </span>
           )}
           {readyCount > 0 && (
             <span className="font-mono admin-text-xs hud-accent-bg-subtle hud-accent px-2.5 py-1 rounded-full font-bold">
               {readyCount} {isAr ? "جاهزة" : "READY"}
             </span>
           )}
         </div>
       </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((ch, idx) => {
          const isSelected = selectedChannelId === ch.id;
          const isLiveFiring = ch.sessionStatus === "ACTIVE";
          const hasSession = laneHasSession(ch.sessionStatus);
          const reservation = hasSession ? undefined : activeScheduleFor(ch);
          const laneBadge = reservation
            ? reservationBadge(isAr)
            : laneStatusBadge(ch.laneStatus, isAr);
          const visibleShots = shotsForLaneDisplay(ch.sessionStatus, ch.shots);
          const totalLaneScore = hasSession
            ? visibleShots.reduce((sum, s) => sum + s.score, 0)
            : 0;
          const lastHit =
            hasSession && visibleShots.length > 0 ? visibleShots[0] : null;
          const bulletsLabel = !hasSession
            ? "—"
            : ch.bulletLimit && ch.bulletLimit > 0
              ? `${visibleShots.length}/${ch.bulletLimit}`
              : `${visibleShots.length}`;

          return (
            <div
              key={ch.id}
              onClick={() => setSelectedChannelId(ch.id)}
className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col gap-3 ${
                 isLiveFiring
                   ? isSelected
                     ? "hud-lane-card--live"
                     : "hud-lane-card"
                   : isSelected
                     ? "hud-lane-card--selected"
                     : "hud-lane-card"
               }`}
            >
              <div className="flex justify-between items-center pl-1">
                <div className="flex items-center gap-2">
<span className="font-mono admin-text-xs font-bold hud-accent-bg-subtle hud-text-subtle px-2 py-0.5 rounded">
                     {isAr ? `حارة ${idx + 1}` : `LANE 0${idx + 1}`}
                   </span>
                   <h3 className="font-sans admin-text-base font-bold truncate max-w-[140px] hud-text">
                     {shooterLabel(ch, reservation)}
                   </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded admin-text-2xs font-mono font-bold uppercase border ${laneBadge.className}`}
                  >
                    {laneBadge.label}
                  </span>
                </div>
              </div>

<div className="grid grid-cols-4 gap-2 bg-hud-elevated p-2.5 rounded-lg border border-hud text-center admin-text-sm font-mono">
                 <div>
                   <span className="block admin-text-2xs hud-text-muted uppercase tracking-wide">
                     {isAr ? "الرصاص" : "BULLETS"}
                   </span>
                   <span className="font-bold mt-0.5 block">{bulletsLabel}</span>
                 </div>
                 <div>
                   <span className="block admin-text-2xs hud-text-muted uppercase tracking-wide">
                     {isAr ? "الوقت" : "TIME"}
                   </span>
                   <SessionTimer
                     startTime={ch.startTime}
                     endTime={ch.endTime}
                     durationSeconds={ch.durationSeconds}
                     totalPausedMs={ch.totalPausedMs}
                     sessionStatus={ch.sessionStatus}
                     language={language}
                     compact
                   />
                 </div>
                 <div>
                   <span className="block admin-text-2xs hud-text-muted uppercase tracking-wide">
                     {isAr ? "النتيجة" : "SCORE"}
                   </span>
                   <span className="font-bold hud-accent mt-0.5 block">
                     {hasSession ? totalLaneScore : "—"}
                   </span>
                 </div>
                 <div>
                   <span className="block admin-text-2xs hud-text-muted uppercase tracking-wide">
                     {isAr ? "آخر طلقة" : "LAST"}
                   </span>
                   <span className="font-bold hud-warning mt-0.5 block">
                     {lastHit ? lastHit.score : "—"}
                   </span>
                 </div>
               </div>

              {hasSession && onViewLaneDetail && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewLaneDetail(ch.id);
                  }}
                  className="p-1 px-2.5 font-mono font-semibold admin-text-2xs rounded flex items-center gap-1 cursor-pointer border hud-accent-bg-subtle hud-text-subtle"
                >
                  {isAr ? "سجل الطلقات" : "SHOT LOG"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
