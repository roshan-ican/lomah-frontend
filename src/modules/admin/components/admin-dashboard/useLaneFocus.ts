import { useState } from "react";
import type { CalibrateMode } from "../../../../types";

interface Params {
  setSelectedChannelId: (id: string) => void;
  setSelectedShotId: (val: number | null) => void;
  setCalibrateMode: (val: CalibrateMode) => void;
}

/**
 * UI state for the CONTROL tab's lane workspace: single-lane focus, the
 * control panel drawer, and the live-board overview toggle. Selecting or
 * switching views always clears the active shot and calibration mode.
 */
export function useLaneFocus({
  setSelectedChannelId,
  setSelectedShotId,
  setCalibrateMode,
}: Params) {
  const [laneFocused, setLaneFocused] = useState(false);
  const [controlPanelOpen, setControlPanelOpen] = useState(true);
  const [liveBoardMode, setLiveBoardMode] = useState(false);

  const handleSelectLane = (channelId: string) => {
    setSelectedChannelId(channelId);
    setSelectedShotId(null);
  };

  const focusLane = (channelId: string) => {
    handleSelectLane(channelId);
    setLaneFocused(true);
    setLiveBoardMode(false);
    setControlPanelOpen(true);
    setCalibrateMode("off");
  };

  const showAllLanes = () => {
    setLaneFocused(false);
    setLiveBoardMode(false);
    setCalibrateMode("off");
    setSelectedShotId(null);
  };

  const toggleLiveBoardMode = () => {
    setLiveBoardMode((showLive) => {
      const next = !showLive;
      setLaneFocused(false);
      setCalibrateMode("off");
      setSelectedShotId(null);
      return next;
    });
  };

  return {
    laneFocused,
    controlPanelOpen,
    setControlPanelOpen,
    liveBoardMode,
    handleSelectLane,
    focusLane,
    showAllLanes,
    toggleLiveBoardMode,
  };
}
