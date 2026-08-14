import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatTimeRemaining, serverNow } from "../../../utils/api";

interface SessionTimerProps {
  startTime?: string;
  endTime?: string;
  durationSeconds?: number;
  totalPausedMs?: number;
  remainingSeconds?: number;
  sessionStatus: string;
  language: "en" | "ar";
  compact?: boolean;
  variant?: "default" | "hud" | "rail";
}

function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** A stage with no clock (`durationSeconds <= 0`) runs until the range officer
 *  advances it, so there is no remaining time to count down — only time spent. */
const isOpenEnded = (durationSeconds: number) => durationSeconds <= 0;

function formatElapsed(
  startIso: string,
  endIso?: string,
  durationSeconds: number = 600,
): string {
  const start = new Date(startIso).getTime();
  if (isOpenEnded(durationSeconds)) {
    const end = endIso ? new Date(endIso).getTime() : serverNow();
    return clock((end - start) / 1000);
  }
  // If the end time is missing (event dropped / not yet delivered), cap the
  // elapsed display at the session's configured duration so the timer can never
  // keep climbing past the limit.
  const end = endIso ? new Date(endIso).getTime() : start + durationSeconds * 1000;
  const elapsedMs = Math.max(0, end - start);
  const cappedMs = Math.min(elapsedMs, durationSeconds * 1000);
  return clock(cappedMs / 1000);
}

/** Time spent firing, excluding pauses. Counts UP — the open-ended counterpart
 *  to formatTimeRemaining. */
function formatElapsedLive(startIso: string, totalPausedMs: number): string {
  const elapsedMs = serverNow() - new Date(startIso).getTime() - totalPausedMs;
  return clock(elapsedMs / 1000);
}

export const SessionTimer: React.FC<SessionTimerProps> = ({
  startTime,
  endTime,
  durationSeconds = 600,
  totalPausedMs = 0,
  remainingSeconds,
  sessionStatus,
  language,
  compact = false,
  variant = "default",
}) => {
  const isAr = language === "ar";
  const isHud = variant === "hud";
  const [display, setDisplay] = useState("--:--");

  useEffect(() => {
    if (
      (sessionStatus === "COMPLETED" || sessionStatus === "REVIEWED") &&
      startTime
    ) {
      setDisplay(formatElapsed(startTime, endTime, durationSeconds));
      return;
    }

    if (sessionStatus === "ACTIVE" && startTime) {
      // Open-ended stages count UP. Counting down from a duration that was
      // never set would show a timer racing to zero and then sitting at 00:00
      // while the stage happily carries on.
      const tick = () =>
        setDisplay(
          isOpenEnded(durationSeconds)
            ? formatElapsedLive(startTime, totalPausedMs)
            : formatTimeRemaining(startTime, durationSeconds, totalPausedMs),
        );
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }

    if (sessionStatus === "PAUSED") {
      if (isOpenEnded(durationSeconds)) {
        // Frozen at the time already spent, not at a remaining figure that
        // does not exist for this stage.
        setDisplay(
          startTime ? formatElapsedLive(startTime, totalPausedMs) : "--:--",
        );
        return;
      }
      const frozen =
        typeof remainingSeconds === "number" &&
        Number.isFinite(remainingSeconds)
          ? remainingSeconds
          : Math.max(
              0,
              durationSeconds -
                Math.floor(
                  (serverNow() -
                    new Date(startTime ?? serverNow()).getTime() -
                    totalPausedMs) /
                    1000,
                ),
            );
      setDisplay(clock(frozen));
      return;
    }

    setDisplay("--:--");
  }, [startTime, endTime, durationSeconds, totalPausedMs, sessionStatus]);

  const openEnded = isOpenEnded(durationSeconds);
  const label =
    sessionStatus === "COMPLETED" || sessionStatus === "REVIEWED"
      ? isAr
        ? "المدة الفعلية"
        : "TIME TAKEN"
      : sessionStatus === "ACTIVE"
        ? isAr
          ? "وقت الجلسة"
          : "SESSION TIME"
        : openEnded
          ? isAr
            ? "الوقت المنقضي"
            : "TIME ELAPSED"
          : isAr
            ? "الوقت المتبقي"
            : "TIME REMAINING";

  if (compact) {
    return (
      <span
        className={`font-mono text-xs font-bold tabular-nums ${
          sessionStatus === "COMPLETED" || sessionStatus === "REVIEWED"
            ? "text-gray-500 dark:text-gray-400"
            : "text-amber-500"
        }`}
      >
        {display}
      </span>
    );
  }

  if (variant === "rail") {
    return <span className="range-display-hero">{display}</span>;
  }

  if (isHud) {
    return (
      <div className="text-center md:text-left">
        <span className="hud-value text-5xl md:text-6xl tracking-tight hud-timer tabular-nums block leading-none">
          {display}
        </span>
        <span className="hud-label mt-2 block hud-text-secondary">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-glass-border bg-white dark:bg-[#1C1F26]">
      <Clock className="w-5 h-5 text-amber-500" />
      <div>
        <span className="text-xs font-mono uppercase text-gray-500 dark:text-gray-400 block">
          {label}
        </span>
        <span className="text-2xl font-mono font-bold text-amber-500 tabular-nums">
          {display}
        </span>
      </div>
    </div>
  );
};
