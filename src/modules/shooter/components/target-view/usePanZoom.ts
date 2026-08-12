import { useCallback, useEffect, useRef, useState } from "react";

export interface PanOffset {
  x: number;
  y: number;
}

interface PanZoomOptions {
  /** The element gestures are read from — also the box pan is clamped against. */
  targetRef: React.RefObject<HTMLElement | null>;
  zoomLevel: number;
  changeZoom: (factor: number) => void;
  enabled?: boolean;
}

/** Distance in px between the first two active touches. */
function touchDistance(touches: TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Midpoint of the first two active touches, in client px. */
function touchMidpoint(touches: TouchList): { x: number; y: number } {
  const [a, b] = [touches[0], touches[1]];
  if (!a || !b) return { x: 0, y: 0 };
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

/** Movement in px before a press becomes a pan rather than a tap. */
const PAN_THRESHOLD_PX = 6;

/**
 * Pan and zoom for the target board.
 *
 * Zoom used to be a bare `scale(z)` about `center center`, which meant the
 * only thing that could ever be magnified was the middle of the face. A group
 * low left went further off screen the harder you looked at it. This adds a
 * translation applied before the scale, and every zoom is anchored to a point:
 *
 *   pan' = anchor - (anchor - pan) * (z' / z)
 *
 * with `anchor` measured from the element's centre, since that is where the
 * scale's origin sits. Solving that keeps whatever is under the cursor or the
 * pinch midpoint pinned while the rest of the board grows around it.
 *
 * The pan is held here rather than lifted to the parent because nothing
 * outside the board has any use for it, and it must reset on the same event
 * that resets zoom — see `reset`.
 */
export function usePanZoom({
  targetRef,
  zoomLevel,
  changeZoom,
  enabled = true,
}: PanZoomOptions) {
  const [pan, setPan] = useState<PanOffset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const zoomRef = useRef(zoomLevel);
  const changeZoomRef = useRef(changeZoom);
  const panRef = useRef(pan);

  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    changeZoomRef.current = changeZoom;
  }, [changeZoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(1);
  const isPinching = useRef(false);

  /**
   * Panning is pointless at or below 1x — there is nothing outside the frame
   * to reach — and a stale offset from a previous zoom would leave the board
   * sitting off-centre with no visible way to bring it back. Zooming out to 1x
   * therefore re-centres.
   */
  useEffect(() => {
    if (zoomLevel <= 1 && (panRef.current.x !== 0 || panRef.current.y !== 0)) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoomLevel]);

  /**
   * How far the board may be dragged: enough to bring any edge of the scaled
   * content to the centre of the frame, and no further. Without a bound the
   * board can be flung off screen entirely, and the only recovery is the reset
   * button — which the operator has to know exists.
   */
  const clampPan = useCallback(
    (next: PanOffset, zoom: number): PanOffset => {
      const el = targetRef.current;
      if (!el) return next;
      const { width, height } = el.getBoundingClientRect();
      const maxX = Math.max(0, (width * Math.max(zoom, 1) - width) / 2 + width / 4);
      const maxY = Math.max(
        0,
        (height * Math.max(zoom, 1) - height) / 2 + height / 4,
      );
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [targetRef],
  );

  /**
   * Apply an absolute zoom anchored at a client point. Pass no anchor for the
   * toolbar buttons, which have no cursor to anchor to and should behave as
   * they always have — about the centre.
   */
  const zoomTo = useCallback(
    (next: number, anchorClient?: { x: number; y: number }) => {
      const current = zoomRef.current;
      const delta = Math.round((next - current) * 100) / 100;
      if (delta === 0) return;
      const applied = current + delta;

      const el = targetRef.current;
      if (el && anchorClient && current > 0) {
        const rect = el.getBoundingClientRect();
        const ax = anchorClient.x - (rect.left + rect.width / 2);
        const ay = anchorClient.y - (rect.top + rect.height / 2);
        const ratio = applied / current;
        const p = panRef.current;
        setPan(
          clampPan(
            { x: ax - (ax - p.x) * ratio, y: ay - (ay - p.y) * ratio },
            applied,
          ),
        );
      }

      changeZoomRef.current(delta);
    },
    [clampPan, targetRef],
  );

  const reset = useCallback(() => {
    setPan({ x: 0, y: 0 });
    changeZoomRef.current(1 - zoomRef.current);
  }, []);

  // ── Pinch + wheel ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = targetRef.current;
    if (!el || !enabled) return;

    const pinchStartMid = { x: 0, y: 0 };
    const pinchStartPan = { x: 0, y: 0 };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      isPinching.current = true;
      pinchStartDistance.current = touchDistance(e.touches);
      pinchStartZoom.current = zoomRef.current;
      const mid = touchMidpoint(e.touches);
      pinchStartMid.x = mid.x;
      pinchStartMid.y = mid.y;
      pinchStartPan.x = panRef.current.x;
      pinchStartPan.y = panRef.current.y;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPinching.current || e.touches.length !== 2) return;
      const dist = touchDistance(e.touches);
      if (!dist || !pinchStartDistance.current) return;
      e.preventDefault();

      // Two fingers do both jobs at once: the change in spread is the zoom,
      // the travel of the midpoint is a pan. Handling only the first makes a
      // pinch that drifts across the board feel like it is fighting back.
      const mid = touchMidpoint(e.touches);
      setPan((prev) =>
        clampPan(
          {
            x: prev.x + (mid.x - pinchStartMid.x),
            y: prev.y + (mid.y - pinchStartMid.y),
          },
          zoomRef.current,
        ),
      );
      pinchStartMid.x = mid.x;
      pinchStartMid.y = mid.y;

      zoomTo(pinchStartZoom.current * (dist / pinchStartDistance.current), mid);
    };

    const endPinch = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isPinching.current = false;
        pinchStartDistance.current = 0;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), {
        x: e.clientX,
        y: e.clientY,
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endPinch);
    el.addEventListener("touchcancel", endPinch);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endPinch);
      el.removeEventListener("touchcancel", endPinch);
      el.removeEventListener("wheel", onWheel);
      isPinching.current = false;
    };
  }, [targetRef, enabled, zoomTo, clampPan]);

  // ── Drag to pan ────────────────────────────────────────────────────────────
  //
  // Only above 1x, and only once the pointer has travelled PAN_THRESHOLD_PX.
  // Below that a press is still a tap, so selecting a bullet keeps working —
  // the marker's own onClick fires normally because nothing has been
  // preventDefault'd or captured yet.
  const panPointer = useRef<{
    id: number;
    lastX: number;
    lastY: number;
    armed: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  const panHandlers = enabled
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (zoomRef.current <= 1 || e.button !== 0) return;
          panPointer.current = {
            id: e.pointerId,
            lastX: e.clientX,
            lastY: e.clientY,
            startX: e.clientX,
            startY: e.clientY,
            armed: false,
          };
        },
        onPointerMove: (e: React.PointerEvent) => {
          const p = panPointer.current;
          if (!p || p.id !== e.pointerId || isPinching.current) return;

          if (!p.armed) {
            const travelled = Math.hypot(
              e.clientX - p.startX,
              e.clientY - p.startY,
            );
            if (travelled < PAN_THRESHOLD_PX) return;
            p.armed = true;
            setIsPanning(true);
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          }

          const dx = e.clientX - p.lastX;
          const dy = e.clientY - p.lastY;
          p.lastX = e.clientX;
          p.lastY = e.clientY;
          setPan((prev) =>
            clampPan({ x: prev.x + dx, y: prev.y + dy }, zoomRef.current),
          );
        },
        onPointerUp: (e: React.PointerEvent) => {
          const p = panPointer.current;
          if (p?.armed) {
            (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
          }
          panPointer.current = null;
          setIsPanning(false);
        },
        onPointerCancel: () => {
          panPointer.current = null;
          setIsPanning(false);
        },
      }
    : {};

  return { pan, isPanning, isPinching, zoomTo, reset, panHandlers };
}
