export const MIN_TARGET_ZOOM = 0.1;
export const MAX_TARGET_ZOOM = 5;

/** Keep every target view on the same zoom range. */
export function clampTargetZoom(value: number): number {
  return Math.min(MAX_TARGET_ZOOM, Math.max(MIN_TARGET_ZOOM, value));
}
