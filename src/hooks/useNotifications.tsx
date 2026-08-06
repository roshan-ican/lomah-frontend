// src/hooks/useNotifications.ts
import { useState } from "react";

export function useNotifications() {
  const [showSuccessBanner, setShowSuccessBanner] = useState<string | null>(
    null,
  );
  const [adminLogs, setAdminLogs] = useState<string[]>([
    "RANGE_CONTROL: Main tactical overlook dashboard initialized safely.",
    "NETWORK_LINK: Optical lane coordinates receiver in standalone thread active.",
    "CALIBRATION: Sensor system thresholds verified for active lanes.",
  ]);

  const triggerSuccessBanner = (msg: string) => {
    setShowSuccessBanner(msg);
    setTimeout(() => setShowSuccessBanner(null), 3800);
  };

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

  return { showSuccessBanner, adminLogs, triggerSuccessBanner, addAdminLog };
}
