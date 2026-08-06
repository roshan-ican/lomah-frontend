/** Board mm: +x right, +y up. Label = hit direction from centre. */
export function shotDirectionLabel(
  x: number,
  y: number,
  language: "en" | "ar" = "en",
): string {
  const len = Math.hypot(x, y);
  if (len < 3) {
    return language === "ar" ? "مركز" : "Center";
  }

  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const sectorsEn = [
    "Right",
    "High right",
    "High",
    "High left",
    "Left",
    "Low left",
    "Low",
    "Low right",
  ];
  const sectorsAr = [
    "يمين",
    "أعلى يمين",
    "أعلى",
    "أعلى يسار",
    "يسار",
    "أسفل يسار",
    "أسفل",
    "أسفل يمين",
  ];
  const idx = Math.round(deg / 45) % 8;
  return language === "ar" ? sectorsAr[idx] : sectorsEn[idx];
}

/** Label for correction arrow — direction toward centre from the hit. */
export function correctionDirectionLabel(
  x: number,
  y: number,
  language: "en" | "ar" = "en",
): string {
  const len = Math.hypot(x, y);
  if (len < 3) {
    return language === "ar" ? "في المركز" : "On centre";
  }
  const toward = shotDirectionLabel(-x, -y, language);
  return language === "ar"
    ? `تصحيح نحو ${toward}`
    : `Toward centre (${toward})`;
}
