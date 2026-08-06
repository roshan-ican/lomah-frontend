/** Open the shooter discovery flow (scan / manual connect to admin). */
export function goToShooterScan(): void {
  if (window.electronAPI?.isElectron) {
    void window.electronAPI.setMode("shooter");
    return;
  }
  window.location.href = "/station/unassigned";
}
