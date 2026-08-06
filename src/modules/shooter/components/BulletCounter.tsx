import React from "react";
import { motion, AnimatePresence } from "motion/react";

interface BulletCounterProps {
  bulletLimit?: number;
  shotsFired: number;
  language: "en" | "ar";
  variant?: "default" | "hud";
}

export const BulletCounter: React.FC<BulletCounterProps> = ({
  bulletLimit = 0,
  shotsFired,
  language,
  variant = "default",
}) => {
  const isAr = language === "ar";
  const isHud = variant === "hud";
  if (!bulletLimit || bulletLimit <= 0) return null;

  const remaining = Math.max(0, bulletLimit - shotsFired);
  const pct = Math.round((remaining / bulletLimit) * 100);
  const filledBlocks = Math.round((remaining / bulletLimit) * 10);

  if (isHud) {
    return (
      <div className="text-center md:text-left">
        <span className="hud-label block mb-3 hud-text-muted">
          {isAr ? "الطلقات" : "ROUNDS"}
        </span>
        <AnimatePresence mode="wait">
          <motion.div
            key={remaining}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <div className="font-mono text-lg tracking-[0.35em] hud-accent mb-2">
              {"█".repeat(filledBlocks)}
              <span className="hud-text-subtle opacity-40">
                {"░".repeat(10 - filledBlocks)}
              </span>
            </div>
            <div className="hud-value text-3xl md:text-4xl hud-text tabular-nums">
              <span className="hud-accent">{remaining}</span>
              <span className="hud-text-muted text-2xl md:text-3xl">
                {" "}
                / {bulletLimit}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[var(--hud-accent-border-strong)] to-transparent">
          <motion.div
            className="h-px bg-[var(--hud-accent)]"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-glass-border bg-white dark:bg-[#1C1F26] shadow-sm">
      <span className="text-xs font-mono uppercase text-gray-400 block mb-2">
        {isAr ? "الرصاص المتبقي" : "Bullets Remaining"}
      </span>

      <AnimatePresence mode="wait">
        <motion.div
          key={remaining}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.1, opacity: 0 }}
          className="flex items-baseline gap-2"
        >
          <span className="text-4xl font-mono font-bold text-emerald-500 tabular-nums">
            {remaining}
          </span>
          <span className="text-lg font-mono text-gray-400">
            / {bulletLimit}
          </span>
        </motion.div>
      </AnimatePresence>

      <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-[#121417] overflow-hidden">
        <motion.div
          className="h-full bg-emerald-500 rounded-full"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  );
};
