import { useEffect, useState } from "react";
import type { LaneConnection } from "./types";
import { api } from "../../../../utils/api";
import type { Lane } from "../../../../types";

const TELEMETRY_ONLINE_MS = 30_000;

/**
 * Live station status per lane.
 *
 * There is no /lanes/status endpoint any more. "Connected" is now derived from
 * hardware telemetry: each target carries a `lastSeenAt` stamped by its
 * heartbeat, so a lane counts as connected when at least one of its targets
 * has reported recently. That is a real reachability signal — the old endpoint
 * reported a lane's configured state, which said nothing about whether the
 * board was actually powered and on the network.
 */
export function useConnectedLanes() {
  const [lanes, setLanes] = useState<LaneConnection[]>([]);

  const refreshLanes = async (): Promise<LaneConnection[]> => {
    try {
      const data = await api.get<Lane[]>("/lanes");
      const now = Date.now();
      const list: LaneConnection[] = (Array.isArray(data) ? data : []).map(
        (lane) => ({
          laneId: lane.id,
          status: lane.status,
          connected: (lane.targets ?? []).some(
            (t) =>
              t.lastSeenAt != null &&
              now - new Date(t.lastSeenAt).getTime() < TELEMETRY_ONLINE_MS,
          ),
        }),
      );
      setLanes(list);
      return list;
    } catch (error: unknown) {
      if (error instanceof Error) console.warn("[Lanes] refresh failed:", error);
      return [];
    }
  };

  useEffect(() => {
    void refreshLanes();
    const handleLaneEvent = () => void refreshLanes();
    window.addEventListener("lomah:lane-event", handleLaneEvent);
    return () => window.removeEventListener("lomah:lane-event", handleLaneEvent);
  }, []);

  return { lanes, refreshLanes };
}
