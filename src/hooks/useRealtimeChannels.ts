// useRealtimeChannels — live link between backend and lane state via WebSocket. Owns connection lifecycle, HTTP catch-up sync, and reconnect logic. Refs mirror state (authStage, user, laneId) so the socket's onmessage handler always reads current values without stale closures. Per-event channel shapes live in realtimeEventHandler.ts.

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RoomAck, WebSocketEvent } from "@shared/types/events";
import type { ApiSessionSnapshot, AuthStage } from "../types";
import { api, getAuthToken, syncServerClock } from "../utils/api";
import { mergeDisplayShots } from "../utils/shotCoordinates";
import {
  applyApiSessionToChannel,
  findOpenSessionForLane,
  findOpenSessionForShooter,
  getLaneIdFromChannelId,
} from "../utils/helper";
import { laneHasSession } from "../utils/laneSession";
import { toVacantLane } from "../store/channelMutations";
import { useSessionStore } from "../store/sessionStore";
import { getCachedShots } from "../db/shotCache";
import { getCachedChannels } from "../db/channelCache";
import type { DisplayShot } from "../types";
import { io, Socket } from "socket.io-client";
import {
  handleRealtimeEvent,
  type RealtimeEventContext,
} from "./realtimeEventHandler";

interface RealtimeDeps {
  authStage: AuthStage;
  loggedInUsername: string;
  shooterAssignedLaneId: number | null;
  selectedChannelId: string;
  setShooterAssignedLaneId: Dispatch<SetStateAction<number | null>>;
  setSelectedChannelId: Dispatch<SetStateAction<string>>;
  isAr: boolean;
  addAdminLog: (msg: string) => void;
  triggerSuccessBanner: (msg: string) => void;
  waitForLaneOffsets: () => Promise<unknown>;
  onFirstShotFired?: (laneId: number) => void;
}

export function useRealtimeChannels({
  authStage,
  loggedInUsername,
  shooterAssignedLaneId,
  selectedChannelId,
  setShooterAssignedLaneId,
  setSelectedChannelId,
  isAr,
  addAdminLog,
  triggerSuccessBanner,
  waitForLaneOffsets,
  onFirstShotFired,
}: RealtimeDeps) {
  const { setChannels } = useSessionStore();

  const socketRef = useRef<Socket | null>(null);
  const selectedChannelIdRef = useRef(selectedChannelId);
  const authStageRef = useRef(authStage);
  const loggedInUsernameRef = useRef(loggedInUsername);
  const shooterAssignedLaneIdRef = useRef(shooterAssignedLaneId);
  // Guards the IndexedDB channel-cache hydration below from ever clobbering
  // real server data — set true the moment syncActiveSessions()'s HTTP sync
  // actually lands. See hydrateChannelsFromCache.
  const serverSyncedRef = useRef(false);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);
  useEffect(() => {
    authStageRef.current = authStage;
  }, [authStage]);
  useEffect(() => {
    loggedInUsernameRef.current = loggedInUsername;
  }, [loggedInUsername]);
  useEffect(() => {
    shooterAssignedLaneIdRef.current = shooterAssignedLaneId;
  }, [shooterAssignedLaneId]);

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const WS_URL =
    import.meta.env.VITE_WS_URL ?? `${wsProtocol}//${window.location.host}`;

  // ─── Sync helpers ──────────────────────────────────────────────────────────

/** One-shot mount-time repaint from IndexedDB channel cache. Runs before HTTP sync so a relaunch shows last known lane state instantly. Only touches untouched channels; bails once serverSyncedRef flips so server data always wins. */
  const hydrateChannelsFromCache = async () => {
    try {
      const cached = await getCachedChannels();
      if (!cached.length) return;
      setChannels((prev) =>
        prev.map((ch) => {
          if (serverSyncedRef.current) return ch;
          if (ch.sessionStatus !== "NONE" || ch.sessionId) return ch;
          const cachedCh = cached.find((c) => c.id === ch.id);
          if (!cachedCh) return ch;
          const { cachedAt: _cachedAt, ...rest } = cachedCh;
          return { ...ch, ...rest, shots: ch.shots };
        }),
      );
    } catch (err) {
      console.warn("[Sync] hydrateChannelsFromCache failed:", err);
    }
  };

  const syncLaneFromApi = async (laneId: number) => {
    try {
      await waitForLaneOffsets();
      const sessions = await api.get<ApiSessionSnapshot[]>("/sessions");
      const list = Array.isArray(sessions) ? sessions : [];
      const activeSession = findOpenSessionForLane(list, laneId);
      const chId = `CH-${laneId}`;
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.id !== chId) return ch;
          if (activeSession) return applyApiSessionToChannel(ch, activeSession);
          if (laneHasSession(ch.sessionStatus)) return ch;
          return toVacantLane(ch);
        }),
      );
      await hydrateShotsFromCache([laneId]);
    } catch (err) {
      console.warn("[Sync] Failed to refresh lane session:", err);
    }
  };

/** Cache-first hydrate: after HTTP sync paints server shots, merge IndexedDB-cached shots into matching channels (server wins on conflicts, cache fills gaps so the board never goes blank on reload). */
  const hydrateShotsFromCache = async (laneIds?: number[]) => {
    try {
      const channels = useSessionStore.getState().channels;
      const targets =
        laneIds ?? channels.map((ch) => getLaneIdFromChannelId(ch.id));
      const updates: Array<{
        chId: string;
        sessionId: string;
        shots: DisplayShot[];
      }> = [];
      await Promise.all(
        targets.map(async (laneId) => {
          const ch = channels.find((c) => c.id === `CH-${laneId}`);
          if (!ch?.sessionId) return;
          const cached = await getCachedShots(ch.sessionId, laneId);
          if (cached && cached.length) {
            updates.push({
              chId: ch.id,
              sessionId: ch.sessionId,
              shots: cached,
            });
          }
        }),
      );
      if (!updates.length) return;
      setChannels((prev) =>
        prev.map((ch) => {
          const upd = updates.find((u) => u.chId === ch.id);
          if (!upd) return ch;
          if (upd.sessionId !== ch.sessionId) return ch;
          // Cached shots are the BASE, server shots are layered on top —
          // mergeDisplayShots lets the second argument win per shot id. The
          // arguments were the other way round, so stale cached coordinates
          // overwrote freshly recalibrated ones from the API and the board
          // appeared not to move after a calibration.
          return { ...ch, shots: mergeDisplayShots(upd.shots, ch.shots) };
        }),
      );
    } catch (err) {
      console.warn("[Sync] hydrateShotsFromCache failed:", err);
    }
  };

  const syncShooterAssignmentFromApi = async (username: string) => {
    try {
      await waitForLaneOffsets();
      const sessions = await api.get<ApiSessionSnapshot[]>("/sessions");
      const list = Array.isArray(sessions) ? sessions : [];
      const mine = findOpenSessionForShooter(list, username);
      if (mine) {
        const chId = `CH-${mine.laneId}`;
        setShooterAssignedLaneId(mine.laneId);
        localStorage.setItem("laneId", String(mine.laneId));
        setChannels((prev) =>
          prev.map((ch) =>
            ch.id === chId ? applyApiSessionToChannel(ch, mine) : ch,
          ),
        );
        serverSyncedRef.current = true;
      } else {
        setShooterAssignedLaneId(null);
        localStorage.removeItem("laneId");
      }
    } catch (err) {
      console.warn("[Sync] Failed to resolve shooter assignment:", err);
    }
  };

  // ─── WS helpers ──────────────────────────────────────────────────────────

  /**
   * Join a lane room. The gateway's entire client->server vocabulary is
   * `join-lane` / `leave-lane` — the old `{action:"subscribe", laneId, userId}`
   * message no longer exists, and neither does per-user addressing: rooms are
   * `lane:<id>` and `admin`, nothing is routed by username.
   *
   * The ack callback is the only way to tell "subscribed" from "silently in no
   * room", so a rejection is surfaced rather than swallowed.
   */
  const subscribeShooterLane = (socket: Socket, chId: string) => {
    const laneId = getLaneIdFromChannelId(chId);
    if (laneId == null) return;
    socket.emit("join-lane", { laneId }, (ack?: RoomAck) => {
      if (ack && !ack.ok) {
        console.warn(`[WebSocket] join-lane(${laneId}) refused: ${ack.error}`);
      }
    });
  };

  const registerShooterWebSocket = (socket: Socket) => {
    const laneId = shooterAssignedLaneIdRef.current;
    // Nothing to join until an admin has assigned this device a lane.
    if (laneId == null) return;
    subscribeShooterLane(socket, `CH-${laneId}`);
  };

  const bindShooterToLane = (laneId: number) => {
    const chId = `CH-${laneId}`;
    setShooterAssignedLaneId(laneId);
    setSelectedChannelId(chId);
    localStorage.setItem("laneId", String(laneId));
    const socket = socketRef.current;
    if (socket?.connected) subscribeShooterLane(socket, chId);
    void syncLaneFromApi(laneId);
  };

  // ─── WebSocket connection + event handling ─────────────────────────────────

  useEffect(() => {
    // socket.io manages reconnection automatically

    const syncActiveSessions = async () => {
      try {
        await waitForLaneOffsets();
        const sessions = await api.get<ApiSessionSnapshot[]>("/sessions");
        if (authStageRef.current === "SHOOTER_BOARD") {
          const user = loggedInUsernameRef.current;
          if (user) await syncShooterAssignmentFromApi(user);
          return;
        }
        const list = Array.isArray(sessions) ? sessions : [];
        setChannels((prev) =>
          prev.map((ch) => {
            const laneNum = getLaneIdFromChannelId(ch.id);
            const activeSession = findOpenSessionForLane(list, laneNum);
            if (activeSession)
              return applyApiSessionToChannel(ch, activeSession);
            if (laneHasSession(ch.sessionStatus)) return ch;
            return toVacantLane(ch);
          }),
        );
        serverSyncedRef.current = true;
        await hydrateShotsFromCache();
      } catch {
        console.warn(
          "Backend server not running. Falling back to local offline simulation.",
        );
      }
    };

    const realtimeCtx: RealtimeEventContext = {
      authStageRef,
      loggedInUsernameRef,
      shooterAssignedLaneIdRef,
      setShooterAssignedLaneId,
      isAr,
      addAdminLog,
      triggerSuccessBanner,
      bindShooterToLane,
      syncLaneFromApi,
      onFirstShotFired,
    };

    const connectWS = () => {
      // The gateway VERIFIES THE JWT AT HANDSHAKE and disconnects immediately
      // if it is missing or invalid — an unauthenticated socket is not merely
      // roomless, it is refused. `auth.token` is the correct channel for this
      // (the server also accepts an Authorization header, for native clients
      // that cannot set handshake auth).
      //
      // No `path` option: the gateway is mounted on socket.io's default
      // /socket.io. The old backend's custom "/ws" path would 404 the upgrade.
      const socket = io(WS_URL, {
        auth: { token: getAuthToken() ?? "" },
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        // Align this device's clock with the server so session countdowns match
        // across admin and shooter machines (see syncServerClock).
        void syncServerClock();
        if (authStageRef.current === "ADMIN_BOARD") {
          // No admin:subscribe emit — handleConnection auto-joins the `admin`
          // room based on the token's role. Nothing for the client to ask for.
          void syncActiveSessions();
        } else if (authStageRef.current === "SHOOTER_BOARD") {
          registerShooterWebSocket(socket);
          const laneId = shooterAssignedLaneIdRef.current;
          if (laneId != null) void syncLaneFromApi(laneId);
        }
      });

      // Sent by the gateway just before it drops the connection. Without
      // handling this the UI shows an endless silent reconnect loop instead of
      // "your session expired, log in again".
      socket.on("unauthorized", (payload: { reason?: string }) => {
        console.error(
          `[WebSocket] Rejected by server: ${payload?.reason ?? "unauthorized"}`,
        );
      });

      socket.onAny((eventName: string, payload: any) => {
        try {
          handleRealtimeEvent(
            { event: eventName, ...payload } as WebSocketEvent,
            realtimeCtx,
          );
        } catch (err) {
          console.error("[WebSocket] Failed to handle event:", err);
        }
      });

      socket.on("disconnect", (reason) => {
        console.log("[WebSocket] Disconnected:", reason);
      });
      socket.on("connect_error", (err) => {
        console.error("[WebSocket] Connection error:", err);
      });
      // A missed shot on weak wifi has two possible causes that look identical
      // from the UI: a full drop (recoverable — the "connect" handler above
      // already resyncs), or packet loss on a connection socket.io never
      // considered dead (recoverable only via the gap-detection resync in
      // realtimeEventHandler.ts's "shot" case). These logs are the difference
      // between the two, so a field report can be diagnosed with the actual
      // engine.io reconnect history instead of a guess.
      socket.io.on("reconnect_attempt", (attempt) => {
        console.log(`[WebSocket] Reconnect attempt #${attempt}`);
      });
      socket.io.on("reconnect", (attempt) => {
        console.log(`[WebSocket] Reconnected after ${attempt} attempt(s)`);
      });
    };

    // Repaint from the local IndexedDB cache first (instant, no blank-lane
    // flash), then let connectWS()/syncActiveSessions() below race against
    // it — serverSyncedRef ensures server data always wins if it lands first.
    void hydrateChannelsFromCache().then(() => hydrateShotsFromCache());

    connectWS();
    void syncActiveSessions();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (authStage !== "ADMIN_BOARD") return;
    void syncLaneFromApi(getLaneIdFromChannelId(selectedChannelId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStage, selectedChannelId]);

  // Backstop for the gap the per-shot check in realtimeEventHandler.ts can't
  // cover on its own: it only re-syncs once ANOTHER shot on the same lane
  // arrives and reveals the discrepancy. If the last shot of a session is the
  // one that gets lost, nothing arrives afterward to trigger that check.
  // Re-syncing whenever the window regains focus (tabbing back after being
  // minimized, or the OS waking a backgrounded tablet screen) catches that.
  useEffect(() => {
    if (authStage !== "ADMIN_BOARD") return;
    const onFocus = () => {
      void syncLaneFromApi(getLaneIdFromChannelId(selectedChannelId));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStage, selectedChannelId]);

  useEffect(() => {
    if (authStage !== "SHOOTER_BOARD" || shooterAssignedLaneId == null) return;
    const socket = socketRef.current;
    if (!socket?.connected) return;
    subscribeShooterLane(socket, `CH-${shooterAssignedLaneId}`);
    void syncLaneFromApi(shooterAssignedLaneId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStage, shooterAssignedLaneId]);

  return { syncLaneFromApi, syncShooterAssignmentFromApi };
}
