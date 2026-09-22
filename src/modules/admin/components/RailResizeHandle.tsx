import React, { useCallback, useRef, useState } from "react";

const STORAGE_KEY = "lomah.railWidth";
const MIN_PX = 288;
const CLOSE_BELOW_PX = 220;
const MAX_VW = 0.6;
const KEY_STEP_PX = 16;

const clampWidth = (px: number) =>
  Math.round(Math.max(MIN_PX, Math.min(window.innerWidth * MAX_VW, px)));

// Past a bound the panel keeps following, with growing resistance, instead of stopping dead.
function rubberband(overshoot: number, dimension: number, c = 0.55) {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

function softWidth(px: number) {
  const max = window.innerWidth * MAX_VW;
  if (px < MIN_PX) return Math.round(MIN_PX - rubberband(MIN_PX - px, MIN_PX));
  if (px > max) return Math.round(max + rubberband(px - max, max));
  return Math.round(px);
}

function readStored(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function useRailWidth() {
  const [width, setWidth] = useState<number | null>(readStored);
  const commit = useCallback((px: number | null) => {
    try {
      if (px == null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(px));
    } catch {
      /* storage unavailable — width just isn't remembered */
    }
  }, []);
  return [width, setWidth, commit] as const;
}

/**
 * Drag edge between the target stage and the right rail. Sits as a zero-width
 * flex item so the rail's own layout rules stay untouched; the hit area
 * overhangs both sides. Tracks the pointer 1:1 from where it was grabbed.
 */
export const RailResizeHandle: React.FC<{
  isAr: boolean;
  width: number | null;
  onWidth: (px: number | null) => void;
  onCommit: (px: number | null) => void;
  onClose: () => void;
}> = ({ isAr, width, onWidth, onCommit, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startWidth: number; raw: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const railWidthNow = () =>
    (ref.current?.nextElementSibling as HTMLElement | null)?.offsetWidth ?? width ?? 512;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startWidth = railWidthNow();
    drag.current = { startX: e.clientX, startWidth, raw: startWidth };
    document.documentElement.dataset.railDragging = "1";
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = (d.startX - e.clientX) * (isAr ? -1 : 1);
    d.raw = d.startWidth + delta;
    onWidth(softWidth(d.raw));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    delete document.documentElement.dataset.railDragging;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!d) return;
    if (d.raw < CLOSE_BELOW_PX) {
      onWidth(d.startWidth);
      onClose();
      return;
    }
    const settled = clampWidth(d.raw);
    onWidth(settled);
    onCommit(settled);
  };

  const reset = () => {
    onWidth(null);
    onCommit(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const grow = isAr ? "ArrowRight" : "ArrowLeft";
    const shrink = isAr ? "ArrowLeft" : "ArrowRight";
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    const next = clampWidth(railWidthNow() + (e.key === grow ? KEY_STEP_PX : -KEY_STEP_PX));
    onWidth(next);
    onCommit(next);
  };

  return (
    <div ref={ref} className="hidden md:block relative w-0 shrink-0 z-20">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={isAr ? "تغيير عرض اللوحة" : "Resize panel"}
        title={
          isAr
            ? "اسحب لتغيير العرض · نقرتان للوضع الافتراضي · اسحب للنهاية للإغلاق"
            : "Drag to resize · double-click to reset · drag all the way to close"
        }
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 -start-1.5 w-3 cursor-col-resize touch-none outline-none"
      >
        <div
          className={`absolute inset-y-0 start-1/2 -translate-x-1/2 w-0.5 rounded-full transition-colors duration-150 ${
            dragging
              ? "bg-[var(--hud-accent)]"
              : "bg-transparent group-hover:bg-[var(--hud-accent-border)] group-focus-visible:bg-[var(--hud-accent)]"
          }`}
        />
      </div>
    </div>
  );
};
