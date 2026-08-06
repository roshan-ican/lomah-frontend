export type SensorCommand = "PLAY" | "STOP" | "HIT";

/**
 * Range-wide admin "cease fire" flag. A DISPLAY signal only — it does not
 * block ingestion; real per-shot gating is the active-stage check in the
 * backend's SensorService. Held at boot, auto-released when a session starts
 * or resumes.
 */
export interface SensorGateStatus {
  adminHeld: boolean;
  accepting: boolean;
}
