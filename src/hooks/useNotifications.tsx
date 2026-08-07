// src/hooks/useNotifications.ts
import { useRef, useState } from "react";

/**
 * A banner is either a confirmation or a failure, and it has to look like
 * whichever it is.
 *
 * There used to be one channel — triggerSuccessBanner — rendered
 * unconditionally in emerald with a bouncing checkmark. Every error path in
 * the app funnelled through it too (`fail()` in useSessionActions calls it
 * with an "Error: ..." string), so a save that 400'd, 401'd or never reached
 * the server produced a green tick that read as confirmation. On a range
 * console that is worse than no feedback at all: the operator moves on
 * believing the plan is stored, and only finds out on the next reload.
 */
export type BannerTone = "success" | "error";

export interface Banner {
  message: string;
  tone: BannerTone;
}

const SUCCESS_MS = 3800;
// Failures stay up more than twice as long. A success is a nod — you already
// know what you did. A failure is the only place the reason is shown, it is
// usually a full sentence from the server, and it is frequently read on a
// tablet across the room.
const ERROR_MS = 9000;

export function useNotifications() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [adminLogs, setAdminLogs] = useState<string[]>([
    "RANGE_CONTROL: Main tactical overlook dashboard initialized safely.",
    "NETWORK_LINK: Optical lane coordinates receiver in standalone thread active.",
    "CALIBRATION: Sensor system thresholds verified for active lanes.",
  ]);

  // The old implementation left an orphan setTimeout per call, so a success
  // fired 100ms after a failure would take the failure's timer with it and
  // clear the error early — or, worse, a stale timer would wipe a banner that
  // had only just appeared.
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = (message: string, tone: BannerTone) => {
    if (dismissRef.current) clearTimeout(dismissRef.current);
    setBanner({ message, tone });
    dismissRef.current = setTimeout(
      () => setBanner(null),
      tone === "error" ? ERROR_MS : SUCCESS_MS,
    );
  };

  const triggerSuccessBanner = (msg: string) => showBanner(msg, "success");
  const triggerErrorBanner = (msg: string) => showBanner(msg, "error");

  // Deep enough to hold the server's 200-line backlog (replayed on admin
  // connect) plus live traffic on top. At 49 the backlog alone used to evict
  // everything else the moment it arrived.
  const MAX_LOGS = 400;

  const addAdminLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setAdminLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, MAX_LOGS - 1)]);
  };

  return {
    banner,
    adminLogs,
    triggerSuccessBanner,
    triggerErrorBanner,
    addAdminLog,
  };
}
