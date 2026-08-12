// Edit a target's mounting offset mid-session.
//
// Anchored over the target board rather than a full-screen backdrop — the
// board must stay visible while the admin types, so the shot markers can be
// watched preview-shifting to the new position before it's saved (the same
// live-preview machinery the drag-to-calibrate flow uses). A full backdrop
// modal would hide the one thing this dialog exists to let the admin check.
//
// It is also DRAGGABLE, by its title bar, for the same reason. Centred over the
// board it sits on exactly the region the admin is trying to watch — usually
// the group around the bullseye — and "type a number, then check what it did to
// the shots" is impossible when the dialog is parked on top of them. The
// position persists while the dialog stays mounted, so an admin who moved it
// aside does not have to move it again on the next edit.
//
// Controlled: x/y live in the caller (LaneWorkspace), not here, so the same
// state that drives this dialog also drives the board's previewOffset — no
// separate copy to keep in sync. The drag offset is the exception: it is pure
// presentation and nothing outside this file has any use for it.
//
// Save commits immediately. There is no second "are you sure" step — typing
// specific numbers and pressing Save is already the deliberate act.

import React, { useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";

interface LaneOffsetEditDialogProps {
  open: boolean;
  committedX: number;
  committedY: number;
  draftX: number;
  draftY: number;
  onChangeX: (value: number) => void;
  onChangeY: (value: number) => void;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
}

/** Kept on screen by this much, so the dialog can never be dragged fully out. */
const KEEP_VISIBLE_PX = 48;

export const LaneOffsetEditDialog: React.FC<LaneOffsetEditDialogProps> = ({
  open,
  committedX,
  committedY,
  draftX,
  draftY,
  onChangeX,
  onChangeY,
  onSave,
  onCancel,
  busy = false,
}) => {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ px: number; py: number; x: number; y: number } | null>(
    null,
  );

  // Hooks first, guard second — returning before useState would make the hook
  // order depend on `open`.
  if (!open) return null;

  /**
   * Clamp so a corner always remains grabbable.
   *
   * The dialog is positioned by centring plus this translation, so the legal
   * range is half the slack in each axis, less the margin we insist on keeping
   * inside the frame. Without it the dialog can be flung past the edge of the
   * board and the only way back is to cancel and reopen.
   */
  const clamp = (x: number, y: number) => {
    const frame = frameRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!frame || !panel) return { x, y };
    const maxX = Math.max(
      0,
      (frame.width - panel.width) / 2 + panel.width - KEEP_VISIBLE_PX,
    );
    const maxY = Math.max(
      0,
      (frame.height - panel.height) / 2 + panel.height - KEEP_VISIBLE_PX,
    );
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    origin.current = { px: e.clientX, py: e.clientY, x: drag.x, y: drag.y };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const o = origin.current;
    if (!o) return;
    setDrag(clamp(o.x + (e.clientX - o.px), o.y + (e.clientY - o.py)));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!origin.current) return;
    origin.current = null;
    setDragging(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={frameRef}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Edit lane offset"
    >
      <div
        ref={panelRef}
        className="mx-4 w-full max-w-xs rounded-lg border border-hud-strong bg-hud-rail shadow-xl"
        style={{
          transform: `translate(${drag.x}px, ${drag.y}px)`,
          // No transition while the pointer is down — an eased transform turns
          // a drag into the panel trailing the cursor.
          transition: dragging ? "none" : "transform 120ms ease-out",
        }}
      >
        {/* The title doubles as the drag handle. Deliberately NOT the whole
            panel: dragging from anywhere would fight the number inputs, where
            a press-and-move is a text selection. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // touch-action none, or the browser claims the gesture as a scroll
          // before any handler here is consulted.
          style={{ touchAction: "none" }}
          className={`flex items-center gap-2 px-4 pt-4 pb-3 select-none ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <GripHorizontal className="w-3.5 h-3.5 hud-text-subtle shrink-0" />
          <p className="range-rail-label hud-text-strong">Edit lane offset</p>
        </div>

        <div className="px-4 pb-4">
          <p className="range-rail-meta hud-text-subtle mb-3 font-mono">
            Currently: x{committedX} y{committedY}mm
          </p>

          <div className="flex items-center gap-2 mb-4">
            <label className="range-rail-meta flex items-center gap-1">
              <span className="hud-text-subtle">x</span>
              <input
                type="number"
                value={draftX}
                onChange={(e) => onChangeX(Number(e.target.value))}
                disabled={busy}
                className="w-16 bg-hud-elevated border border-hud rounded px-1.5 py-1 admin-text-sm font-mono text-hud-strong focus:outline-none focus:border-hud-accent disabled:opacity-60"
              />
            </label>

            <label className="range-rail-meta flex items-center gap-1">
              <span className="hud-text-subtle">y</span>
              <input
                type="number"
                value={draftY}
                onChange={(e) => onChangeY(Number(e.target.value))}
                disabled={busy}
                className="w-16 bg-hud-elevated border border-hud rounded px-1.5 py-1 admin-text-sm font-mono text-hud-strong focus:outline-none focus:border-hud-accent disabled:opacity-60"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="flex-1 hud-label px-3 py-2 rounded-lg hud-btn-resume cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 hud-label px-3 py-2 rounded-lg hud-toolbar-btn--idle cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
