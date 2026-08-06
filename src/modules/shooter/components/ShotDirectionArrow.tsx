import React from "react";
import { shotDirectionLabel } from "../../../utils/shotDirection";

/** Hits inside this radius (board mm) count as centre — no direction to show. */
const DEAD_ZONE_MM = 5;

/**
 * Shot direction arrow: points FROM the board centre TOWARD where the hit
 * landed, i.e. where the shot is relative to the target — the opposite of a
 * correction arrow, which points the way to shift your aim. Rendered at the
 * true angle rather than snapped to one of 8 glyphs, so a hit that is far low
 * and slightly left reads as "down, tilted a little left" instead of a flat
 * "down".
 */
export const ShotDirectionArrow: React.FC<{
  x: number;
  y: number;
  size?: number;
  language: string;
  className?: string;
}> = ({ x, y, size = 18, language, className = "" }) => {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const lang = language === "ar" ? "ar" : "en";
  const label = shotDirectionLabel(safeX, safeY, lang);

  if (Math.hypot(safeX, safeY) < DEAD_ZONE_MM) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ fontSize: `${size}px`, lineHeight: 1 }}
        title={label}
        aria-label={label}
      >
        ◎
      </span>
    );
  }

  // Board mm uses +x right / +y up, so the direction of the hit from the
  // centre is simply (x, y). atan2 gives the maths angle (0° = right, CCW
  // positive); the SVG arrow is drawn pointing up, so the clockwise CSS
  // rotation is 90° - angle.
  const angleDeg = (Math.atan2(safeY, safeX) * 180) / Math.PI;
  const rotation = 90 - angleDeg;

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      title={label}
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: `rotate(${rotation}deg)` }}
        role="img"
      >
        <line x1="12" y1="20" x2="12" y2="4" />
        <polyline points="6,10 12,4 18,10" />
      </svg>
    </span>
  );
};
