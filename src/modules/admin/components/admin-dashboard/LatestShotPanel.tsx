import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { ShotSensorDiagnostic } from "./ShotSensorDiagnostic";

interface LatestShot {
  id: number;
  x: number;
  y: number;
  score: number;
  isMiss: boolean;
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
}

export function LatestShotPanel({
  latestShot,
  isAr,
  isSelected = false,
}: LatestShotPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!latestShot) {
    return null;
  }

  return (
    <div className="rounded-lg border border-hud bg-hud-elevated/80 p-2 space-y-1">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider">
          {isSelected
            ? isAr
              ? "الطلقة المحددة"
              : "Selected Shot"
            : isAr
              ? "آخر طلقة"
              : "Latest Shot"}
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 hud-text-muted" />
        ) : (
          <ChevronDown className="w-3 h-3 hud-text-muted" />
        )}
      </div>

      <div className="flex items-center gap-3 admin-text-2xs font-mono">
        <span className="hud-text font-bold">
          #{latestShot.id}
        </span>
        <span className="hud-text-subtle">
          X = {latestShot.x} mm
        </span>
        <span className="hud-text-subtle">
          Y = {latestShot.y} mm
        </span>
        <span
          className={`font-bold ${
            latestShot.isMiss ? "text-amber-500" : "text-emerald-500"
          }`}
        >
          {latestShot.isMiss ? "MISS" : latestShot.score}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-hud/40 pt-1 mt-1">
          <p className="admin-text-2xs font-mono hud-text-subtle">
            {isAr ? "الوقت" : "Time"}:{" "}
            {new Date(latestShot.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              fractionalSecondDigits: 3,
            })}
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