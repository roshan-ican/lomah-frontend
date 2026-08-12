import React, { useState } from "react";
import { Crosshair } from "lucide-react";
import {
  TARGET_HALF_HEIGHT_MM,
  TARGET_HALF_WIDTH_MM,
} from "../../utils/shotCoordinates";

export interface CalibrationConfirmDetails {
  kind: "lane" | "shots";
  shotCount: number;
  anchorShotId?: number;
  referenceMm?: { x: number; y: number };
  originMm?: { x: number; y: number };
}

interface CalibrationConfirmDialogProps {
  open: boolean;
  details: CalibrationConfirmDetails | null;
  language: "en" | "ar";
  /**
   * `referenceMm` is passed when the operator typed a position instead of
   * accepting the dragged one. Omitted for a plain confirm, so callers that
   * ignore it keep the drag behaviour unchanged.
   */
  onConfirm: (referenceMm?: { x: number; y: number }) => void;
  onCancel: () => void;
}

function fmtMm(value: number): string {
  return `${Math.round(value)} mm`;
}

/**
 * Parse a typed millimetre value.
 *
 * Returns null for anything that is not a finite number so the caller can
 * refuse to apply, rather than letting Number("") === 0 turn a cleared field
 * into a confident "dead centre".
 */
function parseMm(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "+") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export const CalibrationConfirmDialog: React.FC<
  CalibrationConfirmDialogProps
> = ({ open, details, language, onConfirm, onCancel }) => {
  if (!open || !details) return null;

  // Remounted per pending calibration, so the draft below always starts from
  // the position that was actually dragged. A useEffect resetting state on
  // prop change would do the same thing with an extra render and a dependency
  // list to keep correct.
  return (
    <CalibrationConfirmBody
      key={`${details.kind}:${details.anchorShotId ?? ""}:${details.referenceMm?.x ?? ""}:${details.referenceMm?.y ?? ""}`}
      details={details}
      language={language}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};

const CalibrationConfirmBody: React.FC<{
  details: CalibrationConfirmDetails;
  language: "en" | "ar";
  onConfirm: (referenceMm?: { x: number; y: number }) => void;
  onCancel: () => void;
}> = ({ details, language, onConfirm, onCancel }) => {
  const isAr = language === "ar";

  const isLane = details.kind === "lane" && details.anchorShotId != null;
  const editable = isLane && details.referenceMm != null;

  const [draftX, setDraftX] = useState(() =>
    details.referenceMm ? String(Math.round(details.referenceMm.x)) : "",
  );
  const [draftY, setDraftY] = useState(() =>
    details.referenceMm ? String(Math.round(details.referenceMm.y)) : "",
  );

  const parsedX = parseMm(draftX);
  const parsedY = parseMm(draftY);

  const outOfBounds =
    (parsedX != null && Math.abs(parsedX) > TARGET_HALF_WIDTH_MM) ||
    (parsedY != null && Math.abs(parsedY) > TARGET_HALF_HEIGHT_MM);
  const incomplete = editable && (parsedX == null || parsedY == null);
  const blocked = editable && (incomplete || outOfBounds);

  // The shift is recomputed from what is CURRENTLY typed, not from the drag.
  // An operator correcting X to a ruler measurement needs to watch ΔX follow —
  // a delta still describing the discarded drag position is worse than none.
  const effectiveX = editable ? parsedX : (details.referenceMm?.x ?? null);
  const effectiveY = editable ? parsedY : (details.referenceMm?.y ?? null);

  const hasOrigin =
    details.originMm != null &&
    !isNaN(details.originMm.x) &&
    !isNaN(details.originMm.y);

  const deltaX =
    hasOrigin && effectiveX != null ? effectiveX - details.originMm!.x : null;
  const deltaY =
    hasOrigin && effectiveY != null ? effectiveY - details.originMm!.y : null;

  const submit = () => {
    if (blocked) return;
    if (editable && parsedX != null && parsedY != null) {
      onConfirm({ x: Math.round(parsedX), y: Math.round(parsedY) });
      return;
    }
    onConfirm();
  };

  const fieldClass =
    "w-24 rounded-md border border-hud bg-hud-elevated px-2 py-1 text-right " +
    "tabular-nums hud-text-strong font-semibold focus:outline-none " +
    "focus:border-[var(--hud-accent)] focus:ring-1 focus:ring-[var(--hud-accent)]";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calibration-confirm-title"
    >
      <div className="hud-glass w-full max-w-md rounded-xl border border-hud p-5 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <Crosshair className="w-5 h-5 shrink-0 hud-accent mt-0.5" />
          <div>
            <h2
              id="calibration-confirm-title"
              className="admin-text-lg hud-text-strong normal-case tracking-[0.12em]"
            >
              {isAr ? "تأكيد المعايرة" : "Confirm calibration"}
            </h2>
            <p className="admin-text-sm hud-text-secondary mt-2 leading-relaxed">
              {isAr
                ? "هل أنت متأكد من مواضع الطلقات؟ سيتم تطبيق الإحداثيات على الحارة وجميع الطلقات."
                : "Are you sure about these shot positions? Coordinates will be applied to the lane and all listed shots."}
            </p>
          </div>
        </div>

        <dl className="rounded-lg border border-hud bg-hud-elevated/80 p-3 space-y-2 admin-text-sm font-sans">
          <div className="flex justify-between gap-3">
            <dt className="hud-text-muted">{isAr ? "عدد الطلقات" : "Shots"}</dt>
            <dd className="hud-text-strong tabular-nums font-semibold">
              {details.shotCount}
            </dd>
          </div>

          {isLane && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="hud-text-muted">
                  {isAr ? "طلقة المرجع" : "Reference shot"}
                </dt>
                <dd className="hud-text-strong tabular-nums font-semibold">
                  #{details.anchorShotId}
                </dd>
              </div>

              {editable && (
                <div className="flex justify-between gap-3 items-start">
                  <dt className="hud-text-muted pt-1">
                    {isAr ? "الموضع الجديد" : "New position"}
                  </dt>
                  <dd className="flex flex-col gap-1.5 items-end">
                    <label className="flex items-center gap-2">
                      <span className="hud-text-muted admin-text-sm">X</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        value={draftX}
                        onChange={(e) => setDraftX(e.target.value)}
                        aria-label={
                          isAr
                            ? "الموضع الجديد على المحور السيني بالمليمتر"
                            : "New position X in millimetres"
                        }
                        className={fieldClass}
                      />
                      <span className="hud-text-muted admin-text-sm w-6">
                        mm
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="hud-text-muted admin-text-sm">Y</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        value={draftY}
                        onChange={(e) => setDraftY(e.target.value)}
                        aria-label={
                          isAr
                            ? "الموضع الجديد على المحور الصادي بالمليمتر"
                            : "New position Y in millimetres"
                        }
                        className={fieldClass}
                      />
                      <span className="hud-text-muted admin-text-sm w-6">
                        mm
                      </span>
                    </label>
                  </dd>
                </div>
              )}

              {deltaX != null &&
                deltaY != null &&
                (deltaX !== 0 || deltaY !== 0) && (
                  <div className="flex justify-between gap-3">
                    <dt className="hud-text-muted">
                      {isAr ? "الإزاحة" : "Shift applied"}
                    </dt>
                    <dd className="hud-text-strong tabular-nums text-right">
                      ΔX {deltaX > 0 ? "+" : ""}
                      {fmtMm(deltaX)}
                      <br />
                      ΔY {deltaY > 0 ? "+" : ""}
                      {fmtMm(deltaY)}
                    </dd>
                  </div>
                )}
            </>
          )}

          {details.kind === "shots" && (
            <div className="hud-text-secondary admin-text-sm leading-relaxed">
              {isAr
                ? "سيتم تحديث مواضع الطلقات المحددة فقط."
                : "Only the selected shot positions will be updated."}
            </div>
          )}
        </dl>

        {editable && (outOfBounds || incomplete) && (
          <p
            role="alert"
            className="admin-text-sm mt-3 leading-relaxed text-rose-400"
          >
            {outOfBounds
              ? isAr
                ? `الموضع خارج حدود الهدف (±${TARGET_HALF_WIDTH_MM} × ±${TARGET_HALF_HEIGHT_MM} مم).`
                : `Position is off the board (±${TARGET_HALF_WIDTH_MM} × ±${TARGET_HALF_HEIGHT_MM} mm).`
              : isAr
                ? "أدخل قيمة رقمية للمحورين."
                : "Enter a number for both axes."}
          </p>
        )}

        <p className="admin-text-sm hud-text-muted mt-3 leading-relaxed">
          {editable
            ? isAr
              ? "يمكنك تعديل الموضع يدويًا إذا قِسته بشريط قياس — القيم بالمليمتر من مركز الهدف، والقيم الموجبة إلى اليمين وإلى الأعلى."
              : "Type a position if you measured it with a ruler — millimetres from the centre of the face, positive right and up."
            : isAr
              ? "أسهم سجل الطلقات تشير نحو اتجاه الطلقة الفعلي."
              : "Shot-log arrows point in the actual direction of the shot."}
        </p>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 touch-target rounded-lg px-3 py-2 admin-text-sm font-semibold hud-btn-secondary cursor-pointer"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={blocked}
            className="flex-1 touch-target rounded-lg px-3 py-2 admin-text-sm font-bold hud-btn-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAr ? "تطبيق المعايرة" : "Apply calibration"}
          </button>
        </div>
      </div>
    </div>
  );
};
