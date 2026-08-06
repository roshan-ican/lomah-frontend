import { create } from "zustand";
import type { ActiveShooterChannel } from "../types";
import { setCachedChannels } from "../db/channelCache";

const INITIAL_CHANNELS: ActiveShooterChannel[] = Array.from(
  { length: 10 },
  (_v, idx) => {
    const laneNumber = idx + 1;
    const defaultUnits = [
      "ALPHA SQUADRON",
      "DESERT COBRA",
      "SUPPORT SQUAD",
      "NORTH SHIELD",
      "EAST FALCON",
      "WEST RANGER",
      "CENTRAL VIGIL",
      "IRON GUARD",
      "SILVER HAWK",
      "ONYX WARDEN",
    ];
    return {
      id: `CH-${laneNumber}`,
      name: `Shooter ${laneNumber}`,
      opId: `OP-${String(laneNumber).padStart(4, "0")}`,
      unit: defaultUnits[idx] || "ALPHA SQUADRON",
      sessionStatus: "NONE" as const,
      laneStatus: "AVAILABLE",
      distance:
        laneNumber % 3 === 0 ? "500m" : laneNumber % 2 === 0 ? "300m" : "100m",
      targetName: `Target ${String(laneNumber).padStart(2, "0")}`,
      shots: [],
    };
  },
);

interface SessionStore {
  channels: ActiveShooterChannel[];
  setChannels: (
    updater:
      | ActiveShooterChannel[]
      | ((prev: ActiveShooterChannel[]) => ActiveShooterChannel[]),
  ) => void;
  resetChannels: () => void;
}

export const useSessionStore = create<SessionStore>()((set) => ({
  channels: INITIAL_CHANNELS,
  setChannels: (updater) =>
    set((state) => ({
      channels:
        typeof updater === "function" ? updater(state.channels) : updater,
    })),
  resetChannels: () => set({ channels: INITIAL_CHANNELS }),
}));

// Write-through cache: mirrors every state change to IndexedDB (see
// db/channelCache.ts) regardless of which API triggered it — setChannels(),
// or the direct useSessionStore.setState()/getState().setChannels() calls
// elsewhere in the app. Diffed against the last-written snapshot so pure
// per-shot updates (shots are stripped before caching) don't cause redundant
// IndexedDB writes.
let lastMetaSnapshot = "";
useSessionStore.subscribe((state) => {
  const metaOnly = state.channels.map(({ shots: _shots, ...rest }) => rest);
  const snapshot = JSON.stringify(metaOnly);
  if (snapshot === lastMetaSnapshot) return;
  lastMetaSnapshot = snapshot;
  void setCachedChannels(state.channels);
});
