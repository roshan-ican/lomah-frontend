import React from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell } from "./ModalShell";

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
  const isAr = language === "ar";
  const isDanger = variant === "danger";

  return (
    // Escape and the scrim both cancel — never confirm. Cancel is also the
    // first focusable in the panel, so it is what ModalShell focuses on open.
    <ModalShell open={open} onDismiss={onCancel} aria-label={title}>
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
    </ModalShell>
  );
};
