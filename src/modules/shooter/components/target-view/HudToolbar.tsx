import React from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { ActiveShooterChannel } from "../../../../types";
import type { ProfileType } from "./types";

interface Props {
  activeChannel: ActiveShooterChannel;
  hasSensorOffset: boolean;
  distance?: string;
  profileType: ProfileType;
  setProfileType: (val: ProfileType) => void;
  isAr: boolean;
  compact: boolean;
  embedded: boolean;
  hideHudStatus: boolean;
  lockProfileType: boolean;
  zoomLabel: string;
  changeZoom: (val: number) => void;
  resetZoom: () => void;
  toolbarExtra?: React.ReactNode;
}

/** All HUD-variant chrome: status readout, profile toggle, zoom controls, extras. */
export function HudToolbar({
  activeChannel,
  hasSensorOffset,
  distance,
  profileType,
  setProfileType,
  isAr,
  compact,
  embedded,
  hideHudStatus,
  lockProfileType,
  zoomLabel,
  changeZoom,
  resetZoom,
  toolbarExtra,
}: Props) {
  const statusItems = [
    {
      label: isAr ? "قفل الهدف" : "TARGET LOCKED",
      active:
        activeChannel.shots.length > 0 ||
        activeChannel.sessionStatus === "ACTIVE",
    },
    {
      label: isAr ? "معايرة ١٠٠٪" : "100% CALIBRATION",
      active: !hasSensorOffset,
    },
    {
      label: distance || activeChannel.distance || (isAr ? "— مدى" : "— RANGE"),
      active: true,
    },
    {
      label:
        profileType === "FIGURE"
          ? isAr
            ? "وضع الشاخص"
            : "SILHOUETTE MODE"
          : isAr
            ? "وضع الدائرة"
            : "BULLSEYE MODE",
      active: true,
    },
  ];

  const profileTab = (target: ProfileType, en: string, ar: string) => (
    <button
      type="button"
      onClick={() => setProfileType(target)}
      className={`hud-label px-2 py-1 transition-colors cursor-pointer ${
        profileType === target
          ? "hud-accent"
          : "hud-text-subtle hover:hud-text-secondary"
      }`}
    >
      {isAr ? ar : en}
    </button>
  );

  return (
    <>
      {!compact && !embedded && !hideHudStatus && (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {statusItems.map((item) => (
            <span
              key={item.label}
              className={`hud-label flex items-center gap-1.5 ${
                item.active ? "hud-accent" : "hud-text-subtle"
              }`}
            >
              <span
                className={`w-1 h-1 rounded-full ${
                  item.active
                    ? "bg-[var(--hud-accent)] shadow-[0_0_6px_var(--hud-accent)]"
                    : "bg-[var(--hud-text-subtle)]"
                }`}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {!compact && !embedded && !lockProfileType && (
        <div
          className="shrink-0 flex flex-wrap items-center justify-center gap-3"
          dir="ltr"
        >
          {profileTab("CIRCULAR", "BULLSEYE", "دائري")}
          <span className="hud-divider h-3" />
          {profileTab("FIGURE", "SILHOUETTE", "شاخص")}
        </div>
      )}

      {!compact && (
        <div
          className="shrink-0 flex flex-wrap items-center justify-center gap-3"
          dir="ltr"
        >
          <button
            type="button"
            onClick={() => changeZoom(-0.25)}
            className="hud-label p-1 hud-text-subtle hover:hud-accent cursor-pointer"
            aria-label={isAr ? "تصغير الهدف" : "Zoom out"}
            title={isAr ? "تصغير الهدف" : "Zoom out"}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="hud-value text-xs hud-accent min-w-[2.75rem] text-center">
            {zoomLabel}
          </span>
          <button
            type="button"
            onClick={() => changeZoom(0.25)}
            className="hud-label p-1 hud-text-subtle hover:hud-accent cursor-pointer"
            aria-label={isAr ? "تكبير الهدف" : "Zoom in"}
            title={isAr ? "تكبير الهدف" : "Zoom in"}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="hud-label p-1 hud-text-subtle hover:hud-accent cursor-pointer"
            aria-label={isAr ? "إعادة ضبط التكبير" : "Reset zoom"}
            title={isAr ? "إعادة ضبط التكبير" : "Reset zoom"}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {toolbarExtra && (
        <div className="shrink-0 flex items-center justify-center" dir="ltr">
          {toolbarExtra}
        </div>
      )}
    </>
  );
}
