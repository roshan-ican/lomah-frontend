/** Tone shared by every admin log surface — the sensor console's packet log
 *  and the activity log — so both keep reading with one vocabulary. */
export type LogTone = "success" | "error" | "warn" | "pending" | "info";

/** Border/background tint for a log card — status colour, kept subtle so it
 *  reads as a grouping, not as the colour of the text inside it. */
export const getStatusColor = (tone: LogTone): string => {
  switch (tone) {
    case "success":
      return "bg-emerald-500/10 border-emerald-500/30";
    case "error":
      return "bg-rose-500/10 border-rose-500/30";
    case "warn":
    case "pending":
      return "bg-amber-500/10 border-amber-500/30";
    case "info":
      return "bg-[#05927A]/10 border-[#05927A]/30 dark:bg-[#06B699]/10 dark:border-[#06B699]/30";
  }
};

/** Label/chip colour for the same tone. */
export const getLabelColor = (tone: LogTone): string => {
  switch (tone) {
    case "success":
      return "text-emerald-600 dark:text-emerald-400";
    case "error":
      return "text-rose-600 dark:text-rose-400";
    case "warn":
    case "pending":
      return "text-amber-600 dark:text-amber-400";
    case "info":
      return "text-[#05927A] dark:text-[#06B699]";
  }
};
