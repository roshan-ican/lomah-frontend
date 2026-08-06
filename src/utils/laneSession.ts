import type { DisplayShot, LaneSessionStatus } from "../types";
import { getLaneIdFromChannelId } from "./helper";

/**
 * @deprecated Alias for the canonical parser in helper.ts. Kept so existing
 * callers keep working; new code should import getLaneIdFromChannelId directly.
 */
export function laneNumberFromChannelId(chId: string): number {
  return getLaneIdFromChannelId(chId);
}

export function formatLaneLabel(
  chId: string,
  language: "en" | "ar" = "en",
): string {
  const laneNumber = laneNumberFromChannelId(chId);
  return language === "ar" ? `حارة ${laneNumber}` : `Lane ${laneNumber}`;
}

/** True when the lane has a configured, in-progress, or completed session. */
export function laneHasSession(status: LaneSessionStatus): boolean {
  return status !== "NONE";
}

/** Completed session still needs coach review or cancel before the lane is free. */
export function laneNeedsReview(status: LaneSessionStatus): boolean {
  return status === "COMPLETED" || status === "ACTIVE" || status === "PAUSED";
}

/** Lane cannot accept a new shooter until the current session is fully closed. */
export function laneBlocksNewSession(status: LaneSessionStatus): boolean {
  return (
    status === "COMPLETED" ||
    status === "CREATED" ||
    status === "ACTIVE" ||
    status === "PAUSED"
  );
}

/** Only expose shot data on the board when the lane has a real session. */
/** Only expose shot data on the board when the lane has a real session. */
export function shotsForLaneDisplay(
  status: LaneSessionStatus,
  shots: DisplayShot[],
): DisplayShot[] {
  if (!laneHasSession(status)) return [];
  return shots.filter((s) => !s.isCalibrationMarker);
}

/** True when the lane's DB status is AVAILABLE (no active session). */
export function laneIsAvailable(laneStatus?: string): boolean {
  return !laneStatus || laneStatus === "AVAILABLE";
}
