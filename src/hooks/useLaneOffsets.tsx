// src/hooks/useLaneOffsets.ts
import { useCallback } from "react";

/**
 * Historical hook — now a no-op that resolves immediately.
 *
 * It used to fetch per-LANE calibration offsets from /api/debug/lane-settings
 * and load them into the client-side lane-error cache, so the frontend could
 * convert sensor-mm into board-mm itself.
 *
 * Neither half of that is true any more, and re-introducing it would be a bug:
 *
 *   1. Offsets live on the TARGET, not the lane. A lane with a 50m and a 100m
 *      board has two independent mounting errors; applying one lane-wide value
 *      to both is the exact defect the backend rewrite removed.
 *   2. The backend applies the offset BEFORE persisting and before emitting, so
 *      every x/y the client receives is already board-mm. Applying a cached
 *      offset again here would shift every shot by the calibration twice.
 *
 * The hook is kept (rather than deleted) because several components await
 * `waitForLaneOffsets()` before painting, and that ordering guarantee is still
 * a reasonable seam to have if per-target display data ever needs preloading.
 */
export function useLaneOffsets() {
  const waitForLaneOffsets = useCallback((): Promise<void> => {
    return Promise.resolve();
  }, []);

  return { waitForLaneOffsets };
}
