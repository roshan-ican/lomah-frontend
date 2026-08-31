import { DEFAULT_ADMIN_PORT } from "./adminConnection";

/** Open the shooter discovery flow (scan / manual connect to admin). */
export function goToShooterScan(): void {
  if (window.electronAPI?.isElectron) {
    void window.electronAPI.setMode("shooter");
    return;
  }
  window.location.href = "/station/unassigned";
}

/** Post-assignment destination for a shooter tablet.
 *  http(s) origin → keep the existing web origin. Packaged Electron starts
 *  from a trusted file:// bootstrap; keep that local origin for camera access
 *  and carry the remote admin endpoint in its query string. */
export function stationUrl(
  laneId: number,
  adminHost?: string,
  adminPort?: number,
): string {
  if (window.location.protocol === "file:") {
    const current = new URL(window.location.href);
    const host =
      adminHost || current.searchParams.get("adminHost") || "127.0.0.1";
    const port =
      adminPort ||
      Number(current.searchParams.get("adminPort")) ||
      DEFAULT_ADMIN_PORT;
    current.search = "";
    current.hash = "";
    current.searchParams.set("lomahMode", "station");
    current.searchParams.set("laneId", String(laneId));
    current.searchParams.set("adminHost", host);
    current.searchParams.set("adminPort", String(port));
    return current.toString();
  }
  return `${window.location.origin}/station/${laneId}`;
}

/** Return a released packaged shooter to its local discovery screen. */
export function shooterWaitUrl(): string {
  if (window.location.protocol !== "file:") {
    return `${window.location.origin}/station/unassigned`;
  }
  const current = new URL(window.location.href);
  current.search = "";
  current.hash = "";
  current.searchParams.set("lomahMode", "shooter");
  return current.toString();
}
