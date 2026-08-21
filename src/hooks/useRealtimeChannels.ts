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
import { toVacantLane, channelFromLane } from "../store/channelMutations";
import { useSessionStore } from "../store/sessionStore";
import { getCachedShots } from "../db/shotCache";
import { getCachedChannels } from "../db/channelCache";
import type { ActiveShooterChannel, DisplayShot } from "../types";
import type { Lane } from "../types";
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
  // Channel ids currently showing a session that came from the IndexedDB cache
  // rather than from the server or a live socket event. These are unconfirmed
  // guesses, and the HTTP sync is allowed to clear them — see the vacate rule
  // in syncActiveSessions. An id leaves the set the moment the server says
  // anything about that lane.
  const cachePaintedRef = useRef<Set<string>>(new Set());

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
      setChannels((prev) => {
        if (serverSyncedRef.current) return prev;

        // Nothing to map over on a cold start — the store no longer seeds
        // placeholder lanes, so the cached list IS the lane list until the
        // server sends the real one. Without this the grid stays blank for the
        // whole first request, which is the flicker the placeholders were
        // there to hide.
        if (!prev.length) {
          return cached.map((cachedCh) => {
            const { cachedAt: _cachedAt, ...rest } = cachedCh;
            if (laneHasSession(rest.sessionStatus)) {
              cachePaintedRef.current.add(rest.id);
            }
            return { ...rest, shots: [] };
          });
        }

        return prev.map((ch) => {
          if (serverSyncedRef.current) return ch;
          if (ch.sessionStatus !== "NONE" || ch.sessionId) return ch;
          const cachedCh = cached.find((c) => c.id === ch.id);
          if (!cachedCh) return ch;
          const { cachedAt: _cachedAt, ...rest } = cachedCh;
          // Remember that this lane's session is a cached guess. Without this
          // the HTTP sync cannot tell "session the server hasn't told us about
          // yet" from "session the server already ended", and keeps both.
          if (laneHasSession(rest.sessionStatus)) cachePaintedRef.current.add(ch.id);
          return { ...ch, ...rest, shots: ch.shots };
        });
      });
    } catch (err) {
      console.warn("[Sync] hydrateChannelsFromCache failed:", err);
    }
  };

  /**
   * Reconcile one channel against what GET /sessions just said about its lane.
   *
   * The server is authoritative about which sessions are open — findAll
   * deliberately excludes COMPLETED / CANCELLED / SUPERSEDED. But "no open
   * session, so vacate" cannot be applied unconditionally: a session created by
   * a socket event while this request was in flight is not in the response, and
   * wiping it would drop a live session off the grid.
   *
   * So local state survives a silent server EXCEPT when we know it was painted
   * from the IndexedDB cache at mount. That state is an unconfirmed guess about
   * a lane the server has now explicitly reported as clear, so the server wins.
   *
   * Keeping it unconditionally is what pinned an ended session to the lane grid
   * across every refresh: the cache repainted the dead session, the server said
   * the lane was clear, and this handed back the cached session anyway.
   */
  const reconcileChannel = (
    ch: ActiveShooterChannel,
    activeSession: ApiSessionSnapshot | undefined,
  ): ActiveShooterChannel => {
    if (activeSession) {
      cachePaintedRef.current.delete(ch.id);
      return applyApiSessionToChannel(ch, activeSession);
    }
    if (cachePaintedRef.current.has(ch.id)) {
      cachePaintedRef.current.delete(ch.id);
      return toVacantLane(ch);
    }
    if (laneHasSession(ch.sessionStatus)) return ch;
    return toVacantLane(ch);
  };

  /** Reconcile the channel list against the lanes the super admin actually
   *  commissioned (GET /lanes). Channels are rebuilt to match the response
   *  exactly — preserving any live session state on lanes that still exist,
   *  and dropping channels for lanes that no longer do. */
  const syncLanesFromApi = async () => {
    try {
      const lanes = await api.get<Lane[]>("/lanes");
      const list = Array.isArray(lanes) ? lanes : [];
      setChannels((prev) => {
        const existing = new Map(prev.map((ch) => [ch.id, ch]));
        return list.map((lane) => {
          const chId = `CH-${lane.id}`;
          const current = existing.get(chId);
          return current ?? channelFromLane(lane);
        });
      });
    } catch (err) {
      console.warn("[Sync] Failed to reconcile lanes:", err);
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
          return reconcileChannel(ch, activeSession);
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

        if (!useSessionStore.getState().channels.length) {
          await syncLanesFromApi();
        }

        const sessions = await api.get<ApiSessionSnapshot[]>("/sessions");
        if (authStageRef.current === "SHOOTER_BOARD") {
          const user = loggedInUsernameRef.current;
          if (user) await syncShooterAssignmentFromApi(user);
          return;
        }
        const list = Array.isArray(sessions) ? sessions : [];
        let applied = false;
        setChannels((prev) => {
          applied = prev.length > 0;
          return prev.map((ch) => {
            const laneNum = getLaneIdFromChannelId(ch.id);
            return reconcileChannel(ch, findOpenSessionForLane(list, laneNum));
          });
        });

        if (applied) serverSyncedRef.current = true;
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
      // The gateway verifies the JWT at handshake, but only an INVALID token is
      // refused. A MISSING one is accepted as an anonymous, lane-only socket
      // (see RealtimeGateway.handleConnection) so shooter tablets, which carry
      // no credentials by design, can connect at all.
      //
      // Which means this call is silently wrong on a cold login: it runs from a
      // mount effect with no deps, before the operator has signed in, so the
      // token is "" and the resulting socket never joins ADMIN_ROOM. The
      // authStage effect below re-handshakes once a real token exists — do not
      // remove it on the assumption that a tokenless socket would have failed
      // loudly here.
      //
      // `auth.token` is the correct channel for this (the server also accepts
      // an Authorization header, for native clients that cannot set handshake
      // auth).
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

      // The server broadcasts only an invalidation hint—never schedule owner
      // or attendee data. The Schedule tab refetches through its authenticated,
      // privacy-filtered REST endpoint.
      socket.on("lane-schedule:changed", () => {
        window.dispatchEvent(new Event("lomah:lane-schedule-changed"));
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
    // Real lane count comes from the super admin's commissions — reconcile
    // before sessions so the board never shows lanes that were never created
    // (or hides ones that were).
    //
    // Only meaningful if a token already exists at mount (a reload of an
    // already-logged-in board). On a cold login this 401s and the authStage
    // effect below is what actually populates the grid.
    if (getAuthToken()) {
      void syncLanesFromApi().then(() => syncActiveSessions());
    }
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  /**
   * Pull the lane list again once the user is actually authenticated.
   *
   * The mount effect above runs on `[]`, which means its syncLanesFromApi()
   * fires before login has happened — GET /lanes 401s, the catch swallows it,
   * and nothing retries. The result was an empty board on first load that only
   * filled in after a refresh, when the token was already in localStorage by
   * the time the hook mounted. The ten placeholder lanes used to hide this by
   * rendering something regardless of what the server said.
   *
   * Keyed on authStage alone, so it runs on the login transition and not on
   * every lane the operator clicks.
   */
  useEffect(() => {
    if (authStage !== "ADMIN_BOARD" && authStage !== "SHOOTER_BOARD") return;
    if (!getAuthToken()) return;
    void syncLanesFromApi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStage]);

  /**
   * Re-handshake the socket once a token exists.
   *
   * connectWS() runs in the mount effect above, whose dep array is `[]`, so on
   * a cold login it hands socket.io `auth: { token: "" }` — the operator has
   * not signed in yet. That used to be self-correcting: the gateway refused a
   * tokenless socket outright, so the client saw a failed connection and the
   * problem was visible. It is not refused any more. Shooter tablets carry no
   * credentials by design, so RealtimeGateway.handleConnection now ACCEPTS a
   * tokenless socket as anonymous and lane-scoped, and simply never joins it
   * to ADMIN_ROOM.
   *
   * The result is an admin console holding a socket that is connected, silent
   * and roomless. Every session:started / shot / target:calibrated goes to
   * ADMIN_ROOM and this client is not in it, so the board sits on whatever the
   * REST sync last painted — a session reads CREATED with the Start button
   * still up while the server has it ACTIVE and the target armed. Pressing
   * Start again then 400s on the `status !== 'CREATED'` guard, which is the
   * "already ACTIVE" error in the activity log. A refresh appears to fix it
   * only because by then the token is in storage when the hook mounts.
   *
   * Reconnecting rather than opening a second socket: onAny and the rest of
   * the listeners are bound to this instance, and a fresh io() would leave the
   * old one alive and double-handling every event.
   */
  useEffect(() => {
    if (authStage !== "ADMIN_BOARD" && authStage !== "SHOOTER_BOARD") return;
    const socket = socketRef.current;
    const token = getAuthToken() ?? "";
    if (!socket) return;
    const current = (socket.auth as { token?: string } | undefined)?.token ?? "";
    if (current === token) return;
    socket.auth = { token };
    // disconnect().connect() forces a new handshake; without it socket.io keeps
    // the established session and the server never re-reads auth.
    socket.disconnect().connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStage]);

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
