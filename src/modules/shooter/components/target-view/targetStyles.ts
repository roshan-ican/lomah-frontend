// Theme-aware stroke / label colours for the target artwork.

export function figureScoreRingStroke(
  isDarkMode: boolean,
  isHud: boolean,
  tier: 1 | 2 | 3,
): string {
  if (isHud) {
    if (isDarkMode) {
      return (
        [
          "rgba(0, 255, 209, 0.28)",
          "rgba(0, 255, 209, 0.38)",
          "rgba(0, 255, 209, 0.5)",
        ][tier - 1] ?? "rgba(0, 255, 209, 0.28)"
      );
    }
    return (
      [
        "rgba(13, 148, 136, 0.55)",
        "rgba(13, 148, 136, 0.68)",
        "rgba(15, 118, 110, 0.82)",
      ][tier - 1] ?? "rgba(13, 148, 136, 0.55)"
    );
  }
  return isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(15, 23, 42, 0.25)";
}

export function bullseyeRingStroke(
  isDarkMode: boolean,
  zone: "outer" | "mid" | "inner",
): string {
  if (isDarkMode) {
    if (zone === "outer") return "rgba(255,255,255,0.22)";
    if (zone === "mid") return "rgba(255,255,255,0.16)";
    return "rgba(255,255,255,0.24)";
  }
  if (zone === "outer") return "rgba(15, 23, 42, 0.32)";
  if (zone === "mid") return "rgba(15, 23, 42, 0.26)";
  return "rgba(255, 255, 255, 0.38)";
}

export function bullseyeRingLabelClass(
  isDarkMode: boolean,
  val: number,
): string {
  if (isDarkMode) {
    return val >= 5 ? "fill-white/80" : "fill-white/45";
  }
  return val >= 5 ? "fill-slate-700" : "fill-slate-500";
}
