import { create } from "zustand";
import type { ActiveShooterChannel } from "../types";
import { setCachedChannels } from "../db/channelCache";

/**
 * No lanes until the server names them.
 *
 * This used to seed ten invented lanes — "Shooter 3", "ALPHA SQUADRON",
 * "500m" — as a placeholder until GET /lanes replaced them. On a range with
 * fewer than ten commissioned lanes that meant the grid painted lanes that do
 * not exist, then silently dropped them a moment later, and the invented
 * distances and unit names were indistinguishable from real ones while they
 * were up. On a range with MORE than ten, lanes 11+ were missing until the
 * fetch landed.
 *
 * An empty grid for the width of one request is the honest state: the client
 * genuinely does not know the lane list yet. The IndexedDB cache
 * (hydrateChannelsFromCache) is what fills that gap on a relaunch, and it
 * holds lanes that really were commissioned last time.
 */
const INITIAL_CHANNELS: ActiveShooterChannel[] = [];

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
