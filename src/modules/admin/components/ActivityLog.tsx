import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { getBorderColor, getLabelColor, type LogTone } from "./logTones";

interface ActivityLogProps {
  logs: string[];
  isAr: boolean;
  /** Title override; defaults to the localized "Activity Log". */
  title?: string;
  /** Max entries to render (oldest dropped). Defaults to all. */
  limit?: number;
  /** Extra classes for the footer wrapper. */
  className?: string;
  /** Starting height of the log list in pixels, used until the operator drags
   *  the handle. After that their own size wins and is remembered. */
  defaultHeight?: number;
  /** Where the dragged height is remembered. Distinct keys let the admin and
   *  super-admin consoles keep independent sizes — they show the same log but
   *  sit in very different layouts. */
  storageKey?: string;
  /** Start collapsed. Defaults to expanded. */
  defaultCollapsed?: boolean;
}

/** Below this the list is too short to read; above it the panel would swallow
 *  the target view. Both are enforced on every drag frame, not just at rest. */
const MIN_HEIGHT = 72;
const maxHeight = () => Math.round(window.innerHeight * 0.8);

/** Same four-way tone→colour mapping the sensor console's packet log uses, so
 *  both logs read with the same vocabulary: emerald = confirmed, rose = failed,
 *  amber = in-between, light green = plain information. */
type ActivityTone = "success" | "error" | "warn" | "info";

/** The messages are plain strings, so the tone is inferred from the first
 *  keyword after the timestamp (and any ✖/⚠/emoji marker the server attached).
 *  Everything unclassified reads as info — it genuinely is, most of the time. */
const getTone = (rest: string): ActivityTone => {
  const t = rest.replace(/^[^\w:]*/, "");
  if (rest.startsWith("✖") || /^FAILED\b/i.test(t)) return "error";
  if (rest.startsWith("⚠") || /^(PAUSE|ADVANCE|RESET)\b/i.test(t)) return "warn";
  if (/^(START|RESUME|REVIEW|RANGE_CONTROL)\b/i.test(t)) return "success";
  return "info";
};

/** The coloured chip shown in each card's header — the message's own keyword
 *  (FAILED, RESET, SENSITIVITY, TARGET CAL, …), capped at two words so an
 *  over-verbose prefix like "CALIBRATION CARRIED into bulk start" stays short. */
const categoryOf = (rest: string): string => {
  const seg = rest.split(":")[0].trim();
  const words = seg.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  return (words || "LOG").toUpperCase();
};

/** Split `[HH:MM:SS]` (stamped by addAdminLog) off the front so it can render
 *  subtle like the packet log's clock, with the payload left to the body. */
const parseTime = (text: string): { time: string | null; rest: string } => {
  const m = text.match(/^\[(\d{2}:\d{2}:\d{2})\]\s?(.*)$/s);
  return m ? { time: m[1], rest: m[2] } : { time: null, rest: text };
};

/** Highlight the hex the backend embeds in sensor messages — `cmd=0x57(P)`,
 *  `x=0x04D2`, and whole frames like `frame=[24 57 41 02 1E 00 00 DC 23]` — in
 *  the same amber the packet log uses for its HEX line. Timestamps and decimal
 *  numbers are deliberately left alone. */
const HEX_TOKEN = /0x[0-9A-Fa-f]{1,}|\[[0-9A-Fa-f]{2}(?:\s+[0-9A-Fa-f]{2})*\]/g;

const renderHex = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = HEX_TOKEN.exec(text))) {
    if (m.index > last) {
      parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    }
    parts.push(
      <span key={key++} className="font-bold text-amber-700 dark:text-amber-300">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={key++}>{text.slice(last)}</span>);
  }
  return parts;
};

export const ActivityLog: React.FC<ActivityLogProps> = ({
  logs,
  isAr,
  title,
  limit,
  className = "",
  defaultHeight = 200,
  storageKey = "lomah:activity-log-height",
  defaultCollapsed = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [height, setHeight] = useState<number>(() => {
    // Read straight from storage on first render: initialising to the default
    // and correcting in an effect makes the panel visibly jump on every load.
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? Number(saved) : NaN;
      if (Number.isFinite(parsed) && parsed >= MIN_HEIGHT) return parsed;
    } catch {
      // Private mode / storage disabled — the default is a fine answer.
    }
    return defaultHeight;
  });
  const [dragging, setDragging] = useState(false);
  const heightRef = useRef(height);
  heightRef.current = height;

  const heading = title ?? (isAr ? "سجل الأنشطة" : "Activity Log");
  const rows = typeof limit === "number" ? logs.slice(0, limit) : logs;

  const onHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // The panel is anchored to the BOTTOM of the column, so dragging the
      // handle upward (decreasing clientY) must make it taller — hence
      // startY - clientY rather than the other way round.
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = heightRef.current;
      setDragging(true);

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          maxHeight(),
          Math.max(MIN_HEIGHT, startHeight + (startY - ev.clientY)),
        );
        setHeight(next);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setDragging(false);
        try {
          window.localStorage.setItem(storageKey, String(heightRef.current));
        } catch {
          // Non-fatal: the size still applies for this session.
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      // pointercancel matters on touch: without it a cancelled gesture leaves
      // the move listener attached and the panel follows the finger forever.
      window.addEventListener("pointercancel", onUp);
    },
    [storageKey],
  );

  // A saved height can exceed the viewport after a resize or a move to a
  // smaller screen, which would leave the log covering everything.
  useEffect(() => {
    const clamp = () => setHeight((h) => Math.min(h, maxHeight()));
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  return (
    <div className={`shrink-0 border-t border-hud mt-3 ${className}`}>
      {!collapsed && (
        <div
          onPointerDown={onHandleDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label={isAr ? "تغيير ارتفاع السجل" : "Resize activity log"}
          className={`group h-2 -mt-1 mb-0.5 flex items-center justify-center
                      cursor-row-resize touch-none select-none ${
                        dragging ? "opacity-100" : "opacity-50 hover:opacity-100"
                      }`}
        >
          <span
            className={`h-0.5 w-10 rounded-full ${
              dragging ? "bg-[var(--hud-accent)]" : "bg-[var(--hud-divider)]"
            } group-hover:bg-[var(--hud-accent)]`}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2 mb-1.5 cursor-pointer select-none text-left hover:opacity-80"
      >
        <Activity className="w-3.5 h-3.5 shrink-0" />
        <h3 className="admin-text-sm font-mono font-bold hud-text uppercase tracking-wider">
          {heading}
        </h3>
        {/* Count stays visible while collapsed — otherwise there is no way to
            tell a quiet range from a panel that is simply folded shut. */}
        <span className="admin-text-3xs font-mono hud-text-muted">
          ({rows.length})
        </span>
        <span className="ms-auto shrink-0">
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5 hud-text-muted" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 hud-text-muted" />
          )}
        </span>
      </button>

      {!collapsed && (
        <div
          className="space-y-0.5 overflow-y-auto"
          // Explicit height, not min/max: the log shares a flex column with a
          // greedy flex-1 sibling, and a content-sized list renders as a
          // sliver there no matter how much room is free.
          style={{ height, fontSize: "10px" }}
        >
          {rows.length === 0 ? (
            <p className="font-mono admin-text-3xs hud-text-muted italic">
              {isAr ? "لا توجد أنشطة مسجلة" : "No activity recorded"}
            </p>
          ) : (
            rows.map((log, idx) => {
              const { time, rest } = parseTime(log);
              const tone = getTone(rest);
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-1.5 px-1.5 py-1 rounded border font-mono ${getBorderColor(tone)}`}
                >
                  <span className={`text-2xs px-1 rounded font-bold shrink-0 ${getLabelColor(tone)}`}>
                    {categoryOf(rest)}
                  </span>
                  <span className="text-2xs break-all leading-snug">
                    {time && (
                      <span className="hud-text-subtle">[{time}] </span>
                    )}
                    {renderHex(rest)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
