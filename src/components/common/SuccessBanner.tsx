import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";

interface Props {
  message: string | null;
}

export const SuccessBanner = ({ message }: Props) => (
  <AnimatePresence>
    {message && (
      <motion.div
        initial={{ opacity: 0, y: -45, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -25, scale: 0.95 }}
        className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl border shadow-xl bg-[#1C1F26] border-emerald-500/30 text-emerald-400 font-mono admin-text-sm font-bold flex items-center gap-2.5"
      >
        <Check className="w-4 h-4 text-emerald-400 animate-bounce" />
        <span>{message}</span>
      </motion.div>
    )}
  </AnimatePresence>
);
