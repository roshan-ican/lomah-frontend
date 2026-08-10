import type React from "react";
import type { ActiveShooterChannel, CalibrateMode } from "../../../../types";

export type ProfileType = "FIGURE" | "CIRCULAR";

export type ShotMm = { xMm: number; yMm: number };

export type PendingCalibration =
  | {
      kind: "lane";
      anchorShotId: number;
      xMm: number;
      yMm: number;
      originMm: { x: number; y: number };
      shotCount: number;
    }
  | {
      kind: "shots";
      updates: { shotNumber: number; x: number; y: number }[];
      shotCount: number;
    };

export interface TargetViewProps {
  activeChannel: ActiveShooterChannel;
  profileType: ProfileType;
  setProfileType: (val: ProfileType) => void;
  zoomLevel: number;
  changeZoom: (val: number) => void;
  isDarkMode: boolean;
  selectedShotId: number | null;
  setSelectedShotId: (val: number | null) => void;
  targetContainerRef: React.RefObject<HTMLDivElement | null>;
  targetSvgRef?: React.RefObject<SVGSVGElement | null>;
  handleTargetClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onLaneCalibrate?: (
    referenceBoardX: number,
    referenceBoardY: number,
    trueBoardX: number,
    trueBoardY: number,
    referenceShotId: number,
  ) => void;
  onShotsCalibrate?: (
    updates: { shotNumber: number; x: number; y: number }[],
  ) => void;
  calibrateMode?: CalibrateMode;
  triggerSuccessBanner: (msg: string) => void;
  language: "en" | "ar";
  compact?: boolean;
  readOnly?: boolean;
  variant?: "default" | "hud";
  distance?: string;
  size?: "default" | "hero" | "simulator" | "fill";
  embedded?: boolean;
  hideHudStatus?: boolean;
  lockProfileType?: boolean;
  toolbarExtra?: React.ReactNode;
  /** Transient offset (x,y mm) applied only to bullet display while the admin
   *  previews an offset edit. Committed offset comes from
   *  activeChannel.targetOffset; this shifts bullets live without persisting
   *  anything. */
  previewOffset?: { x: number; y: number } | null;
}
