// Shown once, on the FIRST start of a session, when the target still carries a
// mounting offset from earlier work.
//
// The offset lives on the hardware and outlives every session — that is the
// point of storing it on Target rather than on the relay. But it means a new
// shooter silently inherits whatever the last one calibrated, which is right
// when the board has not been touched since, and wrong the moment it was
// re-hung, swapped, or knocked. Neither the operator nor the console can tell
// those apart, so the decision is put to the operator instead of guessed:
// carry it, or start from zero.
//
// Only raised when the offset is non-zero. A target that has never been
// calibrated has nothing to decide about and starts without interruption.

import React from "react";
import { Crosshair } from "lucide-react";

interface CarriedCalibrationDialogProps {
  open: boolean;
  targetLabel: string;
  distanceM?: number;
  offset: { x: number; y: number };
  language: "en" | "ar";
  /** Start the session with the stored offset left in place. */
  onKeep: () => void;
  /** Zero the target's offset, then start. */
  onReset: () => void;
  onCancel: () => void;
  busy?: boolean;
}

function signedMm(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value)} mm`;
}

export const CarriedCalibrationDialog: React.FC<
  CarriedCalibrationDialogProps
> = ({
  open,
  targetLabel,
  distanceM,
  offset,
  language,
  onKeep,
  onReset,
  onCancel,
  busy = false,
}) => {
  if (!open) return null;

  const isAr = language === "ar";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="carried-calibration-title"
    >
      <div className="hud-glass w-full max-w-md rounded-xl border border-hud p-5 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <Crosshair className="w-5 h-5 shrink-0 hud-accent mt-0.5" />
          <div>
            <h2
              id="carried-calibration-title"
              className="admin-text-lg hud-text-strong normal-case tracking-[0.12em]"
            >
              {isAr ? "معايرة محفوظة على الهدف" : "Target is already calibrated"}
            </h2>
            <p className="admin-text-sm hud-text-secondary mt-2 leading-relaxed">
              {isAr
                ? "هذا الهدف يحمل إزاحة من معايرة سابقة. سيتم تطبيقها على كل طلقة في هذه الجلسة ما لم تقم بتصفيرها."
                : "This target still carries an offset from an earlier calibration. It will be applied to every shot in this session unless you reset it."}
            </p>
          </div>
        </div>

        <dl className="rounded-lg border border-hud bg-hud-elevated/80 p-3 space-y-2 admin-text-sm font-sans">
          <div className="flex justify-between gap-3">
            <dt className="hud-text-muted">{isAr ? "الهدف" : "Target"}</dt>
            <dd className="hud-text-strong font-semibold">
              {targetLabel}
              {distanceM != null && (
                <span className="hud-text-muted"> · {distanceM}m</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="hud-text-muted">
              {isAr ? "الإزاحة المحفوظة" : "Stored offset"}
            </dt>
            <dd className="hud-text-strong tabular-nums text-right">
              X {signedMm(offset.x)}
              <br />Y {signedMm(offset.y)}
            </dd>
          </div>
        </dl>

        <p className="admin-text-sm hud-text-muted mt-3 leading-relaxed">
          {isAr
            ? "يمكن إعادة المعايرة في أي وقت أثناء الجلسة بسحب طلقة إلى موضعها الحقيقي — وتُطبَّق القيمة الجديدة على الطلقة التالية مباشرة."
            : "You can recalibrate mid-session at any time by dragging a shot onto where it truly landed — the new value applies from the very next round."}
        </p>

        <div className="flex flex-col gap-2 mt-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={busy}
              className="flex-1 touch-target rounded-lg px-3 py-2 admin-text-sm font-semibold hud-btn-secondary cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAr ? "تصفير ثم البدء" : "Reset to zero & start"}
            </button>
            <button
              type="button"
              onClick={onKeep}
              disabled={busy}
              className="flex-1 touch-target rounded-lg px-3 py-2 admin-text-sm font-bold hud-btn-primary cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAr ? "الاحتفاظ ثم البدء" : "Keep & start"}
            </button>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="touch-target rounded-lg px-3 py-2 admin-text-sm hud-text-muted hover:hud-text-strong cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAr ? "إلغاء" : "Cancel — don't start yet"}
          </button>
        </div>
      </div>
    </div>
  );
};
