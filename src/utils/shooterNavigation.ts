import { DEFAULT_ADMIN_PORT } from "./adminConnection";
import { platform } from "./platform";

/** Open the shooter discovery flow (scan / manual connect to admin). */
export function goToShooterScan(): void {
  if (platform.isDesktop) {
    void platform.setMode("shooter");
    return;
  }
  window.location.href = "/station/unassigned";
}

/** Post-assignment destination for a shooter tablet.
 *  http(s) origin → the origin the UI is already served from (Vite dev on
 *  :3000, or the backend's SPA on :3001 in web deployment) — jumping to a
 *  hardcoded backend port is what used to strand a dev shooter on a stale
 *  built screen. The Electron shooter bootstrap runs off a file:// URL, which
 *  can't host the SPA, so that case keeps the admin backend URL instead. */
export function stationUrl(
  laneId: number,
  adminHost?: string,
  adminPort?: number,
): string {
  if (window.location.protocol === "file:") {
    // Only the Electron shooter bootstrap (ShooterWait) ever runs off file://,
    // and it always supplies the admin host/port. Defensive fallback in case a
    // future caller forgets: loopback admin is the only sensible guess.
    const host = adminHost || "127.0.0.1";
    const port = adminPort || DEFAULT_ADMIN_PORT;
    return `http://${host}:${port}/station/${laneId}`;
  }
  return `${window.location.origin}/station/${laneId}`;
}
