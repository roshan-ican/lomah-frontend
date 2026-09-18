import type { TargetProfileType } from "@shared/coordinates";
import { BACKEND_URL } from "./api";

/**
 * Public assets are root-relative in the web build. The packaged shooter stays
 * on file:// for camera access, so its root would incorrectly become
 * file:///Fig11Target.jpg; use the connected admin backend as the asset origin.
 */
export const FIGURE_TARGET_IMAGE_URL = `${BACKEND_URL}/Fig11Target.jpg`;

/** Map session targetId / targetName to the board profile shown in TargetView. */
export function targetProfileFromTargetId(
  targetId: string | undefined | null,
): TargetProfileType {
  const key = (targetId ?? "").trim().toUpperCase();
  if (!key) return "FIGURE";

  if (
    key === "CIRCULAR" ||
    key.includes("BULL") ||
    key.includes("RING")
  ) {
    return "CIRCULAR";
  }

  return "FIGURE";
}

export function targetProfileLabel(
  profile: TargetProfileType,
  language: "en" | "ar",
): string {
  if (profile === "CIRCULAR") {
    return language === "ar" ? "دائرة مركزية" : "Bullseye";
  }
  return language === "ar" ? "شكل بشري" : "Silhouette";
}
