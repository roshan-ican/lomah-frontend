import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { ShotSensorDiagnostic } from "./ShotSensorDiagnostic";

interface LatestShot {
  id: number;
  x: number;
  y: number;
  score: number;
  isMiss: boolean;
  /** Frame never arrived, as opposed to arrived-but-unresolved. */
  isLost?: boolean;
  timestamp: string;
  /** Board that reported it, for the 'D' sensor query. Undefined on shots
   *  restored from a cache written before targetId was carried per-shot. */
  targetId?: string;
}

interface LatestShotPanelProps {
  latestShot: LatestShot | null;
  isAr: boolean;
  /** True when this is a shot the admin clicked rather than just the newest
   *  one — the heading changes so the two are never confused. */
  isSelected?: boolean;
  /** Rendered inside a host that already draws a frame and a title bar (see
   *  DraggablePanel), so this drops its own box and heading rather than
   *  nesting a second border and repeating the title. */
  embedded?: boolean;
}

/** The heading, also used as the floating panel's drag-bar title. */
export function shotPanelTitle(isSelected: boolean, isAr: boolean): string {
  if (isSelected) return isAr ? "الطلقة المحددة" : "Selected Shot";
  return isAr ? "آخر طلقة" : "Latest Shot";
}

export function LatestShotPanel({
  latestShot,
  isAr,
  isSelected = false,
  embedded = false,
}: LatestShotPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!latestShot) {
    return null;
  }

  return (
    <div
      className={
        embedded
          ? "space-y-1"
          : "rounded-lg border border-hud bg-hud-elevated/80 p-2 space-y-1"
      }
    >
      {!embedded && (
        <div
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider">
            {shotPanelTitle(isSelected, isAr)}
          </span>
          {expanded ? (
            <ChevronUp className="w-3 h-3 hud-text-muted" />
          ) : (
            <ChevronDown className="w-3 h-3 hud-text-muted" />
          )}
        </div>
      )}

      <div
        className={`flex items-center gap-3 admin-text-2xs font-mono ${
          // Embedded, the title row that carried the expand chevron belongs to
          // the host panel's drag bar — so the readout itself becomes the
          // control, rather than leaving the diagnostic with no way to open.
          embedded ? "cursor-pointer select-none" : ""
        }`}
        onClick={embedded ? () => setExpanded(!expanded) : undefined}
      >
        <span className="hud-text font-bold">
          #{latestShot.id}
        </span>
        {/* Coordinates are suppressed for a round with no impact: both are
            zero, and "X = 0 mm Y = 0 mm" next to the word MISS reads as a shot
            that landed dead centre — the opposite of what happened. */}
        {latestShot.isMiss ? (
          <span className="hud-text-subtle">
            {latestShot.isLost
              ? isAr
                ? "لم تصل الإشارة"
                : "frame never arrived"
              : isAr
                ? "لا يوجد كشف"
                : "no detection"}
          </span>
        ) : (
          <>
            <span className="hud-text-subtle">
              X = {latestShot.x} mm
            </span>
            <span className="hud-text-subtle">
              Y = {latestShot.y} mm
            </span>
          </>
        )}
        <span
          className={`font-bold ${
            latestShot.isMiss ? "text-amber-500" : "text-emerald-500"
          }`}
        >
          {latestShot.isLost
            ? "LOST"
            : latestShot.isMiss
              ? "MISS"
              : latestShot.score}
        </span>
        {embedded &&
          (expanded ? (
            <ChevronUp className="w-3 h-3 hud-text-muted ms-auto shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 hud-text-muted ms-auto shrink-0" />
          ))}
      </div>

      {expanded && (
        <div className="border-t border-hud/40 pt-1 mt-1">
          <p className="admin-text-2xs font-mono hud-text-subtle">
            {isAr ? "الوقت" : "Time"}: {latestShot.timestamp}
          </p>
          <ShotSensorDiagnostic
            targetId={latestShot.targetId ?? null}
            shotNumber={latestShot.id}
            isAr={isAr}
          />
        </div>
      )}
    </div>
  );
}