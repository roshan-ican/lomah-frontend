import {
  TARGET_HALF_HEIGHT_MM,
  TARGET_HALF_WIDTH_MM,
} from "@shared/coordinates";
import type { ShotMm } from "./types";

/** Clamp a board-space point to the physical target bounds. */
export function clampBoardMm(mm: ShotMm): ShotMm {
  return {
    xMm: Math.max(
      -TARGET_HALF_WIDTH_MM,
      Math.min(TARGET_HALF_WIDTH_MM, mm.xMm),
    ),
    yMm: Math.max(
      -TARGET_HALF_HEIGHT_MM,
      Math.min(TARGET_HALF_HEIGHT_MM, mm.yMm),
    ),
  };
}
