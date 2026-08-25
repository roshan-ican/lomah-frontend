import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

interface ModalShellProps {
  open: boolean;
  /** Escape and a click on the scrim both call this. Omit to make the dialog
   *  modal in the strict sense — dismissable only by its own buttons. */
  onDismiss?: () => void;
  children: React.ReactNode;
  /** Panel box: size, padding, surface. Defaults to the standard centred card. */
  panelClassName?: string;
  /** Scrim box. Override for a full-bleed dialog that is not a centred card. */
  scrimClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const DEFAULT_SCRIM =
  "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm";
const DEFAULT_PANEL =
  "hud-glass w-full max-w-md rounded-xl border border-hud p-5 shadow-2xl";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The shell every dialog in the app shares: scrim, centred panel, and the
 * behaviour that goes with being modal.
 *
 * It exists because four dialogs had independently reimplemented the same
 * `if (!open) return null` and the same scrim string, and all four were missing
 * the same three things — an enter/exit transition, an Escape handler, and any
 * focus management at all. Tabbing out of one landed on the lane grid behind
 * the scrim, which is inert but still focusable, so the focus ring simply
 * vanished behind the dim.
 *
 * Motion: the panel materialises — blur, scale and offset move together — so it
 * reads as a surface arriving in front of the console rather than a rectangle
 * being faded in. Critically damped, no bounce: these interrupt an operator
 * mid-session and should settle rather than wobble. The exit retraces the entry
 * path exactly instead of leaving along a different one.
 */
export function ModalShell({
  open,
  onDismiss,
  children,
  panelClassName = DEFAULT_PANEL,
  scrimClassName = DEFAULT_SCRIM,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus the first control in the panel. For a confirm dialog that is the
    // Cancel button, which is deliberate: the key an operator hits by reflex
    // and the button already under the cursor should both be the safe one.
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onDismiss) {
        e.stopPropagation();
        onDismiss();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable =
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onDismiss]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={scrimClassName}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          // Target check: a press that starts on the panel and drifts onto the
          // scrim must not count as a dismiss.
          onMouseDown={(e) => {
            if (onDismiss && e.target === e.currentTarget) onDismiss();
          }}
        >
          <motion.div
            ref={panelRef}
            className={panelClassName}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", bounce: 0, duration: 0.32 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
