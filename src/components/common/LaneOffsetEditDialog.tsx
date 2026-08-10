// Edit a target's mounting offset mid-session.
//
// Anchored over the target board rather than a full-screen backdrop — the
// board must stay visible while the admin types, so the shot markers can be
// watched preview-shifting to the new position before it's saved (the same
// live-preview machinery the drag-to-calibrate flow uses). A full backdrop
// modal would hide the one thing this dialog exists to let the admin check.
//
// Controlled: x/y live in the caller (LaneWorkspace), not here, so the same
// state that drives this dialog also drives the board's previewOffset — no
// separate copy to keep in sync.
//
// Save commits immediately. There is no second "are you sure" step — typing
// specific numbers and pressing Save is already the deliberate act.

import React from "react";

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
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Edit lane offset"
    >
      <div className="mx-4 w-full max-w-xs rounded-lg border border-hud-strong bg-hud-rail p-4 shadow-xl">
        <p className="range-rail-label hud-text-strong mb-3">
          Edit lane offset
        </p>

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
  );
};
