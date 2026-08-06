import React from "react";
import { correctionDirectionLabel } from "../../../utils/shotDirection";

/** Hits inside this radius (board mm) count as centre — no correction to give. */
const DEAD_ZONE_MM = 5;

/**
 * Correction arrow: points from the hit *toward* the board centre, i.e. the way
 * the shooter should move their aim. Rendered at the true angle rather than
 * snapped to one of 8 glyphs, so a hit that is far low and slightly left reads
 * as "up, tilted a little right" instead of a flat "up".
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
  const label = correctionDirectionLabel(safeX, safeY, lang);

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

  // Board mm uses +x right / +y up. The correction vector is (-x, -y).
  // atan2 gives the maths angle (0° = right, CCW positive); the SVG arrow is
  // drawn pointing up, so the clockwise CSS rotation is 90° - angle.
  const angleDeg = (Math.atan2(-safeY, -safeX) * 180) / Math.PI;
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
