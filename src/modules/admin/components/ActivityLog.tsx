import React from "react";
import { Activity } from "lucide-react";

interface ActivityLogProps {
  logs: string[];
  isAr: boolean;
  /** Title override; defaults to the localized "Activity Log". */
  title?: string;
  /** Max entries to render (oldest dropped). Defaults to all. */
  limit?: number;
  /** Extra classes for the footer wrapper. */
  className?: string;
  /** Max height of the log list — any CSS length. Defaults to 40dvh. */
  maxHeight?: string;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({
  logs,
  isAr,
  title,
  limit,
  className = "",
  maxHeight = "40dvh",
}) => {
  const heading = title ?? (isAr ? "سجل الأنشطة" : "Activity Log");
  const rows = typeof limit === "number" ? logs.slice(0, limit) : logs;

  return (
    <div className={`shrink-0 border-t border-hud mt-3 pt-3 ${className}`}>
      <h3 className="admin-text-sm font-mono font-bold hud-text uppercase tracking-wider mb-1.5 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5" />
        {heading}
      </h3>

      <div
        className="space-y-0.5 overflow-y-auto"
        style={{ maxHeight }}
      >
        {rows.length === 0 ? (
          <p className="font-mono admin-text-2xs hud-text-muted italic">
            {isAr ? "لا توجد أنشطة مسجلة" : "No activity recorded"}
          </p>
        ) : (
          rows.map((log, idx) => (
            <div key={idx} className="flex items-start gap-2 px-1.5 py-0.5">
              <span className="hud-accent opacity-60 shrink-0 font-mono admin-text-2xs">
                ›
              </span>
              <span className="break-all font-mono admin-text-2xs hud-text-subtle">
                {log}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
