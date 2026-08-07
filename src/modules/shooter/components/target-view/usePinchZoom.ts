

import { useEffect, useRef } from "react";

interface PinchZoomOptions {
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

export function usePinchZoom({
  targetRef,
  zoomLevel,
  changeZoom,
  enabled = true,
}: PinchZoomOptions) {
  const zoomRef = useRef(zoomLevel);
  const changeZoomRef = useRef(changeZoom);

  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);
  
  useEffect(() => {
    changeZoomRef.current = changeZoom;
  }, [changeZoom]);


  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(1);
  const isPinching = useRef(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !enabled) return;

    const applyAbsoluteZoom = (next: number) => {
      const current = zoomRef.current;
      const delta = Math.round((next - current) * 100) / 100;
      if (delta === 0) return;
      changeZoomRef.current(delta);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      isPinching.current = true;
      pinchStartDistance.current = touchDistance(e.touches);
      pinchStartZoom.current = zoomRef.current;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPinching.current || e.touches.length !== 2) return;
      const dist = touchDistance(e.touches);
      if (!dist || !pinchStartDistance.current) return;
      e.preventDefault();
      const ratio = dist / pinchStartDistance.current;
      applyAbsoluteZoom(pinchStartZoom.current * ratio);
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
      const factor = Math.exp(-e.deltaY * 0.01);
      applyAbsoluteZoom(zoomRef.current * factor);
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
  }, [targetRef, enabled]);

  return { isPinching };
}
