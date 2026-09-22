import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Crosshair, Timer, Zap } from "lucide-react";
import {
  behaviourLabel,
  modeSentence,
  type StageMode,
  type StageModeConfig,
} from "../utils/stageMode";

const ICONS: Record<Exclude<StageMode, "STATIC">, React.ElementType> = {
  TIMELINE: Timer,
  REACTIVE: Crosshair,
  COMBINED: Zap,
};

/**
 * What the current stage's target will do, for the shooter. Keyed on the stage
 * so a stage change swaps the card rather than rewriting text in place.
 */
export const StageBehaviourBanner: React.FC<{
  stageId?: string;
  mode?: StageMode;
  config?: StageModeConfig | null;
  isAr: boolean;
}> = ({ stageId, mode, config, isAr }) => {
  const reduce = useReducedMotion();
  const show = !!mode && mode !== "STATIC" && !!config;
  const Icon = show ? ICONS[mode as Exclude<StageMode, "STATIC">] : Timer;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {show && (
        <motion.div
          key={stageId ?? mode}
          dir={isAr ? "rtl" : "ltr"}
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(6px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={reduce ? { duration: 0.2 } : { type: "spring", bounce: 0, duration: 0.35 }}
          className="mx-3 mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150 [@media(prefers-reduced-transparency:reduce)]:bg-zinc-900 [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none [@media(prefers-contrast:more)]:border-white/40"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300 ring-1 ring-inset ring-cyan-300/20">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.95rem] font-semibold leading-tight tracking-[-0.01em] text-white">
              {behaviourLabel(mode!, config, isAr)}
            </p>
            <p className="mt-0.5 text-[0.8rem] leading-snug tracking-[0.005em] text-zinc-300">
              {modeSentence(mode!, config!, isAr)}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
