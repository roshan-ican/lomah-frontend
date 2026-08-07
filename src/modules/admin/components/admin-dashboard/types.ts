import type React from "react";
import type {
  ActiveShooterChannel,
  Shooter,
  CalibrateMode,
} from "../../../../types";
import type { SessionConfig } from "../../../../types/session-control";

export type AdminCommand = "PAUSE" | "RESUME" | "RESET";
export type LanguageCode = "en" | "ar";
export type ProfileType = "FIGURE" | "CIRCULAR";
/**
 * Operations tabs only.
 *
 * There is no hardware tab here on purpose. Sensor addresses, lane layout and
 * calibration are SUPER_ADMIN's commissioning surface (see SuperAdminDashboard)
 * and every write behind them is `@Roles('SUPER_ADMIN')` on the server, so an
 * ADMIN-side hardware screen could only ever render a 403.
 */
export type AdminTab =
  | "CONTROL"
  | "REPORTS"
  | "HELP"
  | "SESSIONS"
  | "SHOOTERS"
  /** SUPER_ADMIN commissioning: lanes and the targets mounted on them. */
  | "LANE_HARDWARE";

// The firing-plan shapes live with the control panel that produces them.
export type {
  StagePlanConfig,
  SessionConfig,
} from "../../../../types/session-control";

export interface SessionFeedback {
  triggerControl: number;
  breathing: number;
  targetAcquisition: number;
  comments: string;
}

export interface AdminDashboardProps {
  channels: ActiveShooterChannel[];
  selectedChannelId: string;
  setSelectedChannelId: (id: string) => void;
  handleAdminCommand: (channelId: string, cmd: AdminCommand) => void;
  /** Resolves true only on a confirmed server write — see SessionControlPanelProps. */
  onCreateSession: (channelId: string, config: SessionConfig) => Promise<boolean>;
  onPauseSession: (channelId: string) => void;
  onResumeSession: (channelId: string) => void;
  onStartAllSessions: () => void;
  onPauseAllSessions: () => void;
  onEndSession: (channelId: string) => void;
  onAdvanceSession: (channelId: string) => void;
  onDiscardSession: (channelId: string) => void;
  onSaveFeedback: (channelId: string, feedback: SessionFeedback) => void;
  onCancelSession: (channelId: string) => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  adminLogs: string[];
  triggerSuccessBanner: (msg: string) => void;
  /** Failures. Rendered red with a warning icon — routing them through
   *  triggerSuccessBanner produced a green checkmark on the word "Error". */
  triggerErrorBanner: (msg: string) => void;
  handleLogout: () => void;
  onDiscardReadySession: (channelId: string) => void;
  zoomLevel: number;
  changeZoom: (factor: number) => void;
  showGrid: boolean;
  setShowGrid: (val: boolean) => void;
  profileType: ProfileType;
  setProfileType: (val: ProfileType) => void;
  selectedShotId: number | null;
  setSelectedShotId: (val: number | null) => void;
  targetContainerRef: React.RefObject<HTMLDivElement | null>;
  calibrateMode: CalibrateMode;
  setCalibrateMode: (val: CalibrateMode) => void;
  onLaneCalibrate: (
    referenceBoardX: number,
    referenceBoardY: number,
    trueBoardX: number,
    trueBoardY: number,
    referenceShotId: number,
  ) => void;
  onShotsCalibrate: (
    updates: { shotNumber: number; x: number; y: number }[],
  ) => void;
  availableShooters: Shooter[];
  calibrationLaneId: number | null;
  setCalibrationLaneId: (laneId: number | null) => void;
  onCalibrationDismiss: () => void;
  onSetOffset: (laneId: number, offsetX: number, offsetY: number) => Promise<boolean>;
  onRefreshShooters: () => void;
}

export interface SensorGate {
  adminHeld: boolean;
  accepting: boolean;
}

export interface LaneConnection {
  laneId: number;
  status: string;
  connected: boolean;
}
