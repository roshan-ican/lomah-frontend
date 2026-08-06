import type { TargetProfileType } from "@shared/coordinates";

/** Map session targetId / targetName to the board profile shown in TargetView. */
export function targetProfileFromTargetId(
  targetId: string | undefined | null,
): TargetProfileType {
  const key = (targetId ?? "").trim().toUpperCase();
  if (!key) return "FIGURE";

  if (
    key === "CIRCULAR" ||
    key.includes("BULL") ||
    key.includes("RING") ||
    key === "TARGET 02" ||
    key === "TARGET 03" ||
    key === "TARGET 04"
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
