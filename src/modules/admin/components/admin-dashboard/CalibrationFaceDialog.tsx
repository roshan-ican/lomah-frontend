import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Loader2,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  PAN_THRESHOLD_PX,
  usePanZoom,
} from "../../../shooter/components/target-view/usePanZoom";
import {
  CalibrationTargetFace,
  type CalibrationRead,
} from "./CalibrationTargetFace";
import type { TargetProfileType } from "../../../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  profileType: TargetProfileType;
  reads: CalibrationRead[];
  offsetXmm: number;
  offsetYmm: number;
  selectedShot: number;
  onSelectShot: (shot: number) => void;
  trueX: number;
  trueY: number;
  trueMarked: boolean;
  onPickTrue: (xMm: number, yMm: number) => void;
  /** Pull shot #selectedShot back off the board — the panel's own read-back. */
  onReadBack: () => void;
  /** Whatever the panel is currently doing; non-null locks the face. */
  busy: string | null;
  isAr: boolean;
}

/** One click of the ± buttons. */
const ZOOM_STEP = 0.2;

/**
 * The calibration face, big.
 *
 * At 240px inline, a millimetre of the 450×1000mm sheet is about a quarter of a
 * pixel, so the operator is asked to click the exact hole in a picture too small
 * to contain it — the step whose entire purpose is precision was the least
 * precise part of the flow. Here the same face fills the screen and carries the
 * board's own pan/zoom (`usePanZoom`), so the mark can be placed while zoomed
 * into the hole.
 *
 * It holds no calibration state: every value is the panel's, passed straight
 * through, so the numbers below the dialog and the markers inside it can never
 * disagree. What it does own is the view — zoom and pan are meaningless outside
 * this window and reset every time it opens.
 */
export function CalibrationFaceDialog({
  open,
  onClose,
  profileType,
  reads,
  offsetXmm,
  offsetYmm,
  selectedShot,
  onSelectShot,
  trueX,
  trueY,
  trueMarked,
  onPickTrue,
  onReadBack,
  busy,
  isAr,
}: Props) {
  const panAreaRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Same clamp the shooter board uses — this is the same artwork, and a range
  // it cannot reach there should not be reachable here.
  const changeZoom = useCallback((factor: number) => {
    setZoomLevel((prev) =>
      Math.min(2, Math.max(0.1, Math.round((prev + factor) * 100) / 100)),
    );
  }, []);

  const { pan, isPanning, panHandlers, reset } = usePanZoom({
    targetRef: panAreaRef,
    zoomLevel,
    changeZoom,
  });

  /**
   * True when the gesture that is finishing travelled far enough to be a pan.
   *
   * A drag still ends in a `click` on the SVG, so without this the operator
   * would re-mark the bullet's true position every time they dragged the
   * board — and re-mark it wherever they happened to let go.
   *
   * The travel is measured here rather than read off `usePanZoom`'s
   * `isPanning`: that is React state, so within a single burst of pointermoves
   * the handler still closes over `false` and a quick flick would slip past the
   * guard and move the mark. The threshold is the hook's own PAN_THRESHOLD_PX,
   * so "this counted as a pan" means the same thing in both places.
   */
  const draggedRef = useRef(false);
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  const guardedPanHandlers = {
    ...panHandlers,
    onPointerDown: (e: React.PointerEvent) => {
      draggedRef.current = false;
      pressRef.current = { x: e.clientX, y: e.clientY };
      panHandlers.onPointerDown?.(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      panHandlers.onPointerMove?.(e);
      const start = pressRef.current;
      // Only above 1x: below it nothing pans, so a press that wanders a few
      // pixels is still a click on the paper and must still place the mark.
      if (!start || zoomLevel <= 1) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= PAN_THRESHOLD_PX) {
        draggedRef.current = true;
      }
    },
  };

  // Opening is the only sensible moment to be back at 1x and centred: a zoom
  // left over from the previous target would drop the operator somewhere on a
  // board they have not looked at yet.
  useEffect(() => {
    if (open) {
      setZoomLevel(1);
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const btnCls =
    "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded admin-text-xs font-mono font-bold hud-btn-secondary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? "وجه الهدف — عرض كامل" : "Target face — full view"}
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap px-3 py-2 border-b border-hud bg-hud-elevated">
        <p className="admin-text-xs font-mono hud-accent uppercase tracking-wider font-bold">
          {isAr ? "معايرة الهدف" : "Target Calibration"}
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeZoom(-ZOOM_STEP)}
            disabled={zoomLevel <= 0.1}
            title={isAr ? "تصغير" : "Zoom out"}
            className={btnCls}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="admin-text-2xs font-mono hud-text tabular-nums w-10 text-center">
            {zoomLevel.toFixed(1)}x
          </span>
          <button
            type="button"
            onClick={() => changeZoom(ZOOM_STEP)}
            disabled={zoomLevel >= 2}
            title={isAr ? "تكبير" : "Zoom in"}
            className={btnCls}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            // Resets the pan as well as the zoom. They are one view state, and
            // returning to 1x while still offset would leave the board parked
            // off-centre with the button that just reset it now doing nothing.
            onClick={reset}
            title={isAr ? "إعادة العرض" : "Reset view"}
            className={btnCls}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider">
            {isAr ? "رقم الطلقة" : "Shot #"}
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={selectedShot}
            disabled={busy !== null}
            onChange={(e) =>
              onSelectShot(
                Math.max(1, Math.min(100, Number(e.target.value) || 1)),
              )
            }
            className="w-16 text-center admin-text-sm font-mono px-2 py-1.5 rounded border border-hud/40 bg-transparent hover:border-hud focus:border-[var(--hud-accent-border)] outline-none transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onReadBack}
            disabled={busy !== null}
            title={
              isAr
                ? "اقرأ ما رآه الجهاز لهذه الطلقة (معاينة فقط)"
                : "Read back what the board saw for this shot (preview only)"
            }
            className={btnCls}
          >
            {busy === "read" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Crosshair className="w-3.5 h-3.5" />
            )}
            {isAr ? "قراءة" : "Read back"}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap admin-text-2xs font-mono hud-text-subtle">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {isAr ? "رآها الجهاز" : "Board saw"}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {isAr ? "الموضع الحقيقي" : "True position"}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          title={isAr ? "إغلاق" : "Close"}
          className={`${btnCls} ${isAr ? "mr-auto" : "ml-auto"}`}
        >
          <X className="w-3.5 h-3.5" />
          {isAr ? "إغلاق" : "Close"}
        </button>
      </div>

      {/* The board itself */}
      <div
        ref={panAreaRef}
        {...guardedPanHandlers}
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
        style={{
          touchAction: zoomLevel > 1 ? "none" : "pan-x pan-y",
          cursor: zoomLevel > 1 ? (isPanning ? "grabbing" : "grab") : undefined,
        }}
      >
        <div
          style={{
            // Translate BEFORE scale. The pan is measured in screen pixels — it
            // comes from pointer deltas — and putting it first keeps it in that
            // space; after the scale it would be multiplied by the zoom and the
            // board would bolt away from the cursor.
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
            transformOrigin: "center center",
          }}
        >
          <CalibrationTargetFace
            profileType={profileType}
            reads={reads}
            offsetXmm={offsetXmm}
            offsetYmm={offsetYmm}
            selectedShot={selectedShot}
            trueX={trueX}
            trueY={trueY}
            trueMarked={trueMarked}
            onPickTrue={onPickTrue}
            onClickGuard={() => draggedRef.current}
            disabled={busy !== null}
            isAr={isAr}
            connectReads
            size="min(82vh, 82vw)"
          />
        </div>
      </div>

      <p className="shrink-0 px-3 py-2 border-t border-hud bg-hud-elevated admin-text-2xs font-mono hud-text-subtle leading-relaxed">
        {isAr
          ? "انقر على الورقة عند الثقب الحقيقي. للتكبير: Ctrl + عجلة الفأرة أو القرص بإصبعين، وللتحريك اسحب اللوحة بعد التكبير. اضغط Esc للإغلاق."
          : "Click the paper where the hole really is. Ctrl + wheel or pinch to zoom, drag to pan once zoomed in. Esc closes."}
      </p>
    </div>
  );
}
