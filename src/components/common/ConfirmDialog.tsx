import React from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  language?: "en" | "ar";
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  language = "en",
  confirmLabel,
  cancelLabel,
  variant = "danger",
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const isAr = language === "ar";
  const isDanger = variant === "danger";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="hud-glass w-full max-w-md rounded-xl border border-hud p-5 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle
            className={`w-5 h-5 shrink-0 mt-0.5 ${isDanger ? "text-rose-500" : "text-emerald-500"}`}
          />
          <div>
            <h2 className="admin-text-lg hud-text-strong normal-case tracking-[0.12em]">
              {title}
            </h2>
            <p className="admin-text-sm hud-text-secondary mt-2 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 touch-target rounded-lg px-3 py-2 admin-text-sm font-semibold hud-btn-secondary cursor-pointer"
          >
            {cancelLabel ?? (isAr ? "إلغاء" : "Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 touch-target rounded-lg px-3 py-2 admin-text-sm font-bold cursor-pointer ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "hud-btn-primary"
            }`}
          >
            {confirmLabel ?? (isAr ? "تأكيد" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
};
