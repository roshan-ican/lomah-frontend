import React from "react";
import { Crosshair } from "lucide-react";

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
  onConfirm: () => void;
  onCancel: () => void;
}

function fmtMm(value: number): string {
  return `${Math.round(value)} mm`;
}

export const CalibrationConfirmDialog: React.FC<
  CalibrationConfirmDialogProps
> = ({ open, details, language, onConfirm, onCancel }) => {
  if (!open || !details) return null;

  const isAr = language === "ar";
  const deltaX =
    details.referenceMm &&
    details.originMm &&
    !isNaN(details.originMm.x) &&
    !isNaN(details.originMm.y)
      ? details.referenceMm.x - details.originMm.x
      : null;

  const deltaY =
    details.referenceMm &&
    details.originMm &&
    !isNaN(details.originMm.x) &&
    !isNaN(details.originMm.y)
      ? details.referenceMm.y - details.originMm.y
      : null;

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

          {details.kind === "lane" && details.anchorShotId != null && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="hud-text-muted">
                  {isAr ? "طلقة المرجع" : "Reference shot"}
                </dt>
                <dd className="hud-text-strong tabular-nums font-semibold">
                  #{details.anchorShotId}
                </dd>
              </div>
              {details.referenceMm && (
                <div className="flex justify-between gap-3">
                  <dt className="hud-text-muted">
                    {isAr ? "الموضع الجديد" : "New position"}
                  </dt>
                  <dd className="hud-text-strong tabular-nums text-right">
                    X {fmtMm(details.referenceMm.x)}
                    <br />Y {fmtMm(details.referenceMm.y)}
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

        <p className="admin-text-sm hud-text-muted mt-3 leading-relaxed">
          {isAr
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
            onClick={onConfirm}
            className="flex-1 touch-target rounded-lg px-3 py-2 admin-text-sm font-bold hud-btn-primary cursor-pointer"
          >
            {isAr ? "تطبيق المعايرة" : "Apply calibration"}
          </button>
        </div>
      </div>
    </div>
  );
};
