/**
 * A panel that floats over its container instead of sitting in the layout.
 *
 * The shot readout used to be a block above the target: it consumed a fixed
 * strip of height whether or not anyone was reading it, and expanding the
 * sensor diagnostic inside it pushed the target board down mid-session — the
 * one thing on the screen that must not move while shots are landing.
 *
 * So this takes the panel out of flow entirely (`absolute`), lets the operator
 * put it wherever the board is empty, and remembers that spot. Position is
 * stored in pixels from the container's top-left, not as a fraction of it: the
 * operator parks the panel relative to the target's edge, and a fraction would
 * slide it across the board every time the window changed size.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripHorizontal, X } from "lucide-react";

interface DraggablePanelProps {
  /** Distinguishes saved positions when more than one panel is in play. */
  storageKey: string;
  title: string;
  onClose: () => void;
  /** Where it sits before it has ever been dragged, in px from top-left. */
  defaultPosition?: { x: number; y: number };
  children: React.ReactNode;
  isAr?: boolean;
}

interface Point {
  x: number;
  y: number;
}

function readStored(key: string): Point | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Point).x === "number" &&
      typeof (parsed as Point).y === "number"
    ) {
      return parsed as Point;
    }
  } catch {
    // Corrupt or unavailable storage (private mode, quota) is not worth a
    // crash over — the panel just opens at its default corner.
  }
  return null;
}

export function DraggablePanel({
  storageKey,
  title,
  onClose,
  defaultPosition = { x: 8, y: 8 },
  children,
  isAr = false,
}: DraggablePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Point>(() => readStored(storageKey) ?? defaultPosition);

  // Where inside the panel the pointer grabbed it. Without this the panel
  // jumps so its corner meets the cursor on the first move.
  const grabOffset = useRef<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  /**
   * Keep the panel inside its container.
   *
   * A position saved on a wide monitor will be off the edge of a laptop
   * screen, and a panel that cannot be seen also cannot be dragged back — it
   * would look to the operator like the toggle had simply stopped working.
   * Clamping on every open and every resize is what makes that unreachable.
   */
  const clamp = useCallback((next: Point): Point => {
    const el = panelRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return next;

    const maxX = Math.max(0, parent.clientWidth - el.offsetWidth);
    const maxY = Math.max(0, parent.clientHeight - el.offsetHeight);
    return {
      x: Math.min(Math.max(0, next.x), maxX),
      y: Math.min(Math.max(0, next.y), maxY),
    };
  }, []);

  // Layout effect, not effect: this runs before paint, so a stored position
  // that needs clamping is never briefly rendered off-screen.
  useLayoutEffect(() => {
    setPos((p) => clamp(p));
  }, [clamp]);

  useEffect(() => {
    const parent = panelRef.current?.offsetParent as HTMLElement | null;
    if (!parent || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => setPos((p) => clamp(p)));
    observer.observe(parent);
    return () => observer.disconnect();
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left button / touch / pen only. A right-click drag would fight the
    // context menu.
    if (e.button !== 0) return;

    const el = panelRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    grabOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);

    // Pointer capture, not a window listener: the pointer routinely outruns a
    // React re-render, and without capture a fast drag drops the panel the
    // moment the cursor leaves it.
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;

    const parent = panelRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;

    const bounds = parent.getBoundingClientRect();
    setPos(
      clamp({
        x: e.clientX - bounds.left - grabOffset.current.x,
        y: e.clientY - bounds.top - grabOffset.current.y,
      }),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Written on release rather than on every move: a drag fires pointermove
    // at screen rate, and a synchronous localStorage write per frame is enough
    // to make the drag itself stutter.
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pos));
    } catch {
      // Unavailable storage costs the operator a remembered position, nothing
      // more.
    }
  };

  return (
    <div
      ref={panelRef}
      dir={isAr ? "rtl" : "ltr"}
      className={`absolute z-30 w-[min(20rem,calc(100%-1rem))] rounded-lg border border-hud bg-hud-elevated/95 backdrop-blur-sm shadow-lg ${
        dragging ? "select-none" : ""
      }`}
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // touch-none stops the browser claiming the gesture as a scroll, which
        // otherwise makes the panel undraggable on the range tablets.
        className={`flex items-center gap-2 px-2 py-1 border-b border-hud/40 touch-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <GripHorizontal className="w-3 h-3 hud-text-muted shrink-0" />
        <span className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={isAr ? "إغلاق" : "Close"}
          className="ms-auto shrink-0 inline-flex items-center justify-center rounded hud-text-muted hover:hud-accent cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="p-2">{children}</div>
    </div>
  );
}
