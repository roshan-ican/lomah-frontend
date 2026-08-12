import React, { useState, useEffect, useRef, useCallback } from "react";
import { Target, MonitorSmartphone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { io, Socket } from "socket.io-client";
import type { ActiveShooterChannel, Session } from "../types";
import type { RoomAck, WebSocketEvent } from "@shared/types/events";
import { resolveDisplayStage } from "../utils/helper";
import {
  boardMmToSensorCoords,
  mapRawShotToDisplay,
  mergeDisplayShots,
  setLaneError,
  sortShotsNewestFirst,
  zoneFromOffset,
} from "../utils/shotCoordinates";
import { applyCalibratedShots } from "../store/channelMutations";
import { targetProfileFromTargetId } from "../utils/targetProfile";
import { clickToSensorCoords } from "../utils/shotCoordinates";
import { api, getAuthToken, syncServerClock } from "../utils/api";
import { stationUrl } from "../utils/shooterNavigation";
import { ShooterDashboard } from "../modules/shooter/components/ShooterDashboard";
import { useSessionStore } from "../store/sessionStore";
import { useLaneOffsets } from "../hooks/useLaneOffsets";

/**
 * There is no `session:sync` event any more — the gateway pushes lifecycle
 * events only, and the full session record is fetched over HTTP. This is the
 * shape this screen keeps locally, folded from GET /sessions/:id.
 */
interface StationSession {
  status: "IDLE" | "ACTIVE" | "PAUSED" | "COMPLETED";
  laneId: number;
  sessionId: string | null;
  shooterName: string | null;
  /** Whichever stage is live — bullet limit, duration and target are all
   *  per-stage now, not per-session. */
  stageId?: string;
  stageOrder?: number;
  targetId?: string;
  bulletLimit?: number;
  durationSeconds?: number;
  startedAt?: string;
  totalPausedMs?: number;
  notes?: string;
}

function createDefaultChannel(laneId: number): ActiveShooterChannel {
  return {
    id: `CH-${laneId}`,
    name: "Guest Shooter",
    opId: "GUEST",
    unit: "STATION",
    sessionStatus: "NONE",
    distance: "100m",
    targetName: `Target ${String(laneId).padStart(2, "0")}`,
    shots: [],
  };
}

export function StationTerminal() {
  const laneId = parseInt(
    window.location.pathname.split("/station/")[1] || "1",
    10,
  );

  const { waitForLaneOffsets } = useLaneOffsets();

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("lomah_theme");
    if (stored === "light") return false;
    return true;
  });
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const isAr = language === "ar";

  const [sessionStatus, setSessionStatus] = useState<
    "IDLE" | "ACTIVE" | "PAUSED" | "COMPLETED"
  >("IDLE");
  const [session, setSession] = useState<StationSession | null>(null);
  const [activeChannel, setActiveChannel] = useState<ActiveShooterChannel>(
    createDefaultChannel(laneId),
  );
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const [zoomLevel, setZoomLevel] = useState(0.68);
  const [showGrid, setShowGrid] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [isShotPending, setIsShotPending] = useState(false);

  const targetContainerRef = useRef<HTMLDivElement | null>(null);
  const targetSvgRef = useRef<SVGSVGElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeChannelRef = useRef(activeChannel);
  /** Server-minted device key, same one ShooterWait used before the redirect —
   *  needed to join the device room so a reassignment push lands here. */
  const deviceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  useEffect(() => {
    useSessionStore.setState((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === activeChannel.id ? activeChannel : ch,
      ),
    }));
  }, [activeChannel]);

  /** Pull this lane's shots from the server and merge them in.
   *
   *  There is no per-lane shots endpoint any more: shots hang off a STAGE, so
   *  the whole session record is fetched and the live stage's shots taken from
   *  it. Deliberately the full list rather than a delta — a calibration
   *  rewrites coordinates of shots already held, and mergeDisplayShots lets the
   *  incoming copy win, so a full refetch also repairs stale positions. The
   *  list is capped by the stage's bullet limit, so it stays small. */
  const restoreShots = useCallback(async () => {
    try {
      // Lane offsets drive the click→sensor mapping and the calibration
      // overlay, so load them before painting — same ordering the admin uses in
      // useRealtimeChannels.syncActiveSessions.
      await waitForLaneOffsets();
      const sessionId = activeChannelRef.current.sessionId;
      if (!sessionId) return;

      // `/sessions/:id` is ADMIN-only, and a shooter tablet carries no JWT.
      // `/sessions/by-lane/:laneId` is the public, lane-scoped read that
      // returns the same live-session shape without the auth requirement.
      const record = await api.get<Session | null>(`/sessions/by-lane/${laneId}`);
      if (!record) return;
      const stage = resolveDisplayStage(record);
      const shots = stage?.shots ?? [];
      if (!shots.length) return;

      const profile = targetProfileFromTargetId(stage?.targetId);
      const restored = shots.map((s) =>
        mapRawShotToDisplay(
          {
            shotNumber: s.shotNumber,
            x: s.x,
            y: s.y,
            sensorXmm: s.sensorXmm,
            sensorYmm: s.sensorYmm,
            isMiss: s.isMiss,
            isLost: s.isLost,
            timestamp: s.firedAt,
          },
          undefined,
          laneId,
          profile,
          s.score,
        ),
      );
      setActiveChannel((prev) => {
        const updated = {
          ...prev,
          shots: mergeDisplayShots(prev.shots, restored),
        };
        useSessionStore.setState((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === updated.id ? updated : ch,
          ),
        }));
        return updated;
      });
    } catch (err) {
      console.warn("[StationTerminal] Restore shots failed:", err);
    }
  }, [laneId, waitForLaneOffsets]);

  /** Fold a fetched session record into local state — shared by
   *  restoreSessionFromApi (re-read by id, triggered off a socket event) and
   *  hydrateFromLane (looked up by lane, on mount). Explicitly sets
   *  sessionStatus: the socket handlers normally do that themselves as each
   *  lifecycle event arrives, but a plain record fetch has no event to piggy
   *  back on, so this is the only place that would otherwise happen. */
  const applySessionRecord = useCallback(
    (record: Session) => {
      const stage = resolveDisplayStage(record);
      const live = record.status === "ACTIVE" || record.status === "PAUSED";

      setSession({
        status: live
          ? (record.status as "ACTIVE" | "PAUSED")
          : record.status === "COMPLETED"
            ? "COMPLETED"
            : "IDLE",
        laneId,
        sessionId: record.id,
        shooterName: record.shooterName,
        stageId: stage?.id,
        stageOrder: stage?.order,
        targetId: stage?.targetId,
        bulletLimit: stage?.bulletLimit,
        durationSeconds: stage?.durationSeconds,
        startedAt: stage?.startedAt ?? undefined,
        totalPausedMs: record.totalPausedMs,
        notes: record.notes ?? undefined,
      });

      setActiveChannel((prev) => ({
        ...prev,
        sessionStatus: record.status,
        name: record.shooterName || prev.name,
        opId: record.shooterName || prev.opId,
        sessionId: record.id,
        activeStageId: stage?.id,
        activeStageOrder: stage?.order,
        targetName: stage?.targetId ?? prev.targetName,
        bulletLimit: stage?.bulletLimit,
        durationSeconds: stage?.durationSeconds,
        totalPausedMs: record.totalPausedMs,
        startTime: stage?.startedAt
          ? new Date(stage.startedAt).toISOString()
          : prev.startTime,
      }));

      setSessionStatus(
        record.status === "ACTIVE" || record.status === "PAUSED"
          ? record.status
          : record.status === "COMPLETED"
            ? "COMPLETED"
            : "IDLE",
      );
    },
    [laneId],
  );

  /**
   * Re-read the whole session record and fold it into local state.
   *
   * This replaces what `session:sync` used to push. Lifecycle events now carry
   * only what changed — the stage plan (which target, how many rounds, how
   * long) lives on the session record and has to be fetched.
   */
  const restoreSessionFromApi = useCallback(async () => {
    const sessionId = activeChannelRef.current.sessionId;
    if (!sessionId) return;
    try {
      // Same auth reasoning as restoreShots: the protected `/sessions/:id`
      // route 401s a token-less shooter tablet, so read the lane's live
      // session through the public endpoint instead. Otherwise the stage
      // plan (durationSeconds, bulletLimit) never lands and the timer falls
      // back to its 10-minute default countdown.
      const record = await api.get<Session | null>(`/sessions/by-lane/${laneId}`);
      if (!record) return;
      applySessionRecord(record);
    } catch (err) {
      console.warn("[StationTerminal] Session refresh failed:", err);
    }
  }, [laneId, applySessionRecord]);

  /**
   * Discover an already-active session on this lane at mount/reconnect time.
   *
   * A shooter's socket only ever sees lifecycle events broadcast WHILE it is
   * connected — socket.io does not replay history, and this tablet may well
   * be landing on /station/:laneId after the admin already created and
   * started the session. Without this, sessionStatus stays "IDLE" forever
   * and the terminal sits on the idle "LANE n" screen no matter what happens
   * on the lane. Public/unauthenticated by design (see
   * SessionsService.findActiveByLane) — a shooter tablet carries no JWT.
   */
  const hydrateFromLane = useCallback(async () => {
    try {
      const record = await api.get<Session | null>(`/sessions/by-lane/${laneId}`);
      if (record) applySessionRecord(record);
    } catch (err) {
      console.warn("[StationTerminal] Lane hydration failed:", err);
    }
  }, [laneId, applySessionRecord]);

  useEffect(() => {
    void hydrateFromLane();
  }, [hydrateFromLane]);

  // Restore once the session identity is known: the profile used for scoring
  // comes from the stage's target, so running before the session record lands
  // would score the restored shots against the wrong target.
  useEffect(() => {
    if (!activeChannel.sessionId) return;
    void restoreShots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneId, activeChannel.sessionId]);

  const triggerSuccessBanner = useCallback((msg: string) => {
    setBannerMsg(msg);
    setTimeout(() => setBannerMsg(null), 4000);
  }, []);

  const changeZoom = useCallback((factor: number) => {
    setZoomLevel((prev) => {
      const next = prev + factor;
      if (next >= 0.1 && next <= 2) return parseFloat(next.toFixed(1));
      return prev;
    });
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
      root.classList.remove("light");
      localStorage.setItem("lomah_theme", "dark");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      localStorage.setItem("lomah_theme", "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    window.document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const WS_URL =
      import.meta.env.VITE_WS_URL ??
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

    // Default socket.io path (the old backend's custom "/ws" would 404), and a
    // JWT in the handshake — the gateway refuses an unauthenticated socket
    // outright rather than merely leaving it roomless.
    const socket = io(WS_URL, { auth: { token: getAuthToken() ?? "" } });
    socketRef.current = socket;

    socket.on("connect", () => {
      // Re-measure on every (re)connect: this device's clock may differ from the
      // admin's, which would otherwise skew the session countdown.
      void syncServerClock();
      socket.emit("join-lane", { laneId }, (ack?: RoomAck) => {
        if (ack && !ack.ok) {
          console.warn(`[StationTerminal] join-lane refused: ${ack.error}`);
        }
      });
      // Catch up on anything missed while disconnected — socket.io does not
      // replay events fired during the gap, so without this a shooter that
      // briefly lost wifi stays permanently behind on shots.
      void restoreShots();

      // Learn this device's server-minted key and join its device room, so an
      // admin reassigning this tablet to another lane pushes `device:assigned`
      // straight here and the terminal follows without a manual reload. The
      // response also carries the lane the server believes this device owns —
      // if an assignment landed while we were disconnected, the mismatch is
      // what still moves us (the same catch-up role ShooterWait's poll plays).
      void (async () => {
        try {
          const identity = await api.post<{
            key?: string;
            laneId?: number | null;
          }>("/auth/connect", {});
          if (identity?.key) {
            deviceKeyRef.current = identity.key;
            socket.emit(
              "join-device",
              { key: identity.key },
              (ack?: RoomAck) => {
                if (ack && !ack.ok) {
                  console.warn(
                    `[StationTerminal] join-device refused: ${ack.error}`,
                  );
                }
              },
            );
          }
          if (identity?.laneId != null && identity.laneId !== laneId) {
            window.location.href = stationUrl(identity.laneId);
          }
        } catch (err) {
          console.warn("[StationTerminal] device room bind failed:", err);
        }
      })();
    });

    socket.on(
      "device:assigned",
      (event: { key?: string; laneId?: number | null }) => {
        // The room already scopes this, but a device that rejoined under a new
        // key could briefly still be in the old room — only act on our own.
        if (event?.key && event.key !== deviceKeyRef.current) return;
        if (event?.laneId == null) {
          // Released — the admin gave this device's lane away. Back to waiting.
          window.location.href = `${window.location.origin}/station/unassigned`;
          return;
        }
        if (event.laneId !== laneId) {
          window.location.href = stationUrl(event.laneId);
        }
      },
    );

    socket.on("unauthorized", (payload: { reason?: string }) => {
      console.error(
        `[StationTerminal] Rejected by server: ${payload?.reason ?? "unauthorized"}`,
      );
    });

    socket.onAny((eventName: string, payload: any) => {
      try {
        handleWsEvent({ event: eventName, ...payload } as WebSocketEvent);
      } catch (err) {
        console.error("[StationTerminal] Event handling error:", err);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[StationTerminal] Disconnected:", reason);
    });
    socket.on("connect_error", (err) => {
      console.error("[StationTerminal] WS error:", err);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // restoreShots is stable per laneId (waitForLaneOffsets is memoised with no
    // deps), so listing it here cannot cause an extra reconnect. handleWsEvent is
    // deliberately omitted — it changes with `language`, and depending on it would
    // tear down and rebuild the socket every time the operator switches language.
  }, [laneId, restoreShots]);

  const handleWsEvent = useCallback(
    (data: WebSocketEvent) => {
      const { event } = data;
      if ("laneId" in data && data.laneId !== laneId) return;

      // There is no session:sync any more. Any lifecycle event that changes
      // what the stage plan looks like triggers an HTTP re-read instead — the
      // events carry only what changed, not the whole record.
      const refetch = () => void restoreSessionFromApi();

      if (event === "session:created") {
        setActiveChannel({
          ...createDefaultChannel(laneId),
          sessionStatus: "CREATED",
          name: data.shooterName || "Guest Shooter",
          opId: data.shooterName || "GUEST",
          sessionId: data.sessionId,
          shots: [],
        });
        setSession({
          status: "IDLE",
          laneId,
          sessionId: data.sessionId,
          shooterName: data.shooterName,
        });
        refetch();
        return;
      }

      if (event === "session:started") {
        setSessionStatus("ACTIVE");
        setActiveChannel((prev) => ({
          ...prev,
          sessionStatus: "ACTIVE",
          sessionId: data.sessionId,
          activeStageId: data.stageId,
          activeStageOrder: data.stageOrder,
          targetName: data.targetId,
          // The clock belongs to the stage that just armed.
          startTime: new Date(data.startedAt).toISOString(),
          totalPausedMs: 0,
          shots: data.sessionId !== prev.sessionId ? [] : prev.shots,
        }));
        refetch();
        return;
      }

      if (event === "session:resumed") {
        setSessionStatus("ACTIVE");
        setActiveChannel((prev) => ({
          ...prev,
          sessionStatus: "ACTIVE",
          totalPausedMs: data.totalPausedMs,
          remainingSeconds: undefined,
        }));
        triggerSuccessBanner(isAr ? "تم استئناف الجلسة." : "Session resumed.");
        return;
      }

      if (event === "session:paused") {
        setSessionStatus("PAUSED");
        setActiveChannel((prev) => ({ ...prev, sessionStatus: "PAUSED" }));
        triggerSuccessBanner(
          isAr
            ? "تم تعليق الجلسة من قبل المشرف."
            : "Session paused by range officer.",
        );
        return;
      }

      if (event === "session:advanced") {
        // No next stage means the relay is over; session:completed follows.
        if (data.toStageId === undefined) return;
        setActiveChannel((prev) => ({
          ...prev,
          activeStageId: data.toStageId,
          activeStageOrder: data.toStageOrder,
          // Each stage scores against its own target, so the board resets
          // rather than carrying the previous stage's holes forward.
          shots: [],
          startTime: new Date().toISOString(),
        }));
        triggerSuccessBanner(
          isAr
            ? `المرحلة ${(data.toStageOrder ?? 0) + 1}`
            : `Stage ${(data.toStageOrder ?? 0) + 1}`,
        );
        refetch();
        return;
      }

      if (event === "session:completed" || event === "session:reviewed") {
        setSessionStatus("IDLE");
        setSession(null);
        setActiveChannel(createDefaultChannel(laneId));
        return;
      }

      if (event === "session:shots_reset") {
        setActiveChannel((prev) => ({ ...prev, shots: [] }));
        triggerSuccessBanner(
          isAr ? "تم تصفير سجل الطلقات." : "Shot log cleared.",
        );
        return;
      }

      if (event === "shot") {
        // Sentinel miss — the sensor fired but resolved nothing, so there is
        // no position to draw. Already classified by the backend against the
        // raw values; never re-derived here.
        //
        // Kept in the list all the same: a round that was fired belongs in the
        // shooter's log whether or not the board could locate it. Only the
        // target plot skips it, since its x/y are zero and drawing them would
        // put a no-detection on the bullseye.
        const newShot = mapRawShotToDisplay(
          {
            shotNumber: data.shotNumber,
            x: data.x,
            y: data.y,
            sensorXmm: data.sensorXmm,
            sensorYmm: data.sensorYmm,
            isMiss: data.isMiss,
            isLost: data.isLost,
            timestamp: data.firedAt,
          },
          data.shotNumber,
          laneId,
          targetProfileFromTargetId(activeChannelRef.current.targetName),
          data.score,
        );
        if (newShot.id <= 0) return;

        setActiveChannel((prev) => {
          if (data.sessionId !== prev.sessionId) {
            if (!prev.sessionId) {
              return {
                ...prev,
                sessionId: data.sessionId,
                shots: mergeDisplayShots(prev.shots, [newShot]),
              };
            }
            return { ...prev, sessionId: data.sessionId, shots: [newShot] };
          }
          if (prev.shots.some((s) => s.id === newShot.id)) return prev;
          return { ...prev, shots: mergeDisplayShots(prev.shots, [newShot]) };
        });
        return;
      }

      if (event === "target:calibrated") {
        // The backend has already re-scored the affected stage's shots; it is
        // the only place that knows which stage that was, so re-read rather
        // than replaying the arithmetic here.
        if (data.shotsUpdated > 0) void restoreShots();
        triggerSuccessBanner(
          isAr ? "تمت معايرة الهدف" : "Target calibration applied",
        );
        return;
      }

      if (event === "shot:calibrated") {
        const updatedShot = mapRawShotToDisplay(
          {
            shotNumber: data.shotNumber,
            x: data.x,
            y: data.y,
            // Survives the drag on purpose: x/y are now wherever the operator
            // put them, and this is the only remaining record of what the
            // board actually read for this bullet.
            sensorXmm: data.sensorXmm,
            sensorYmm: data.sensorYmm,
            isMiss: false,
          },
          data.shotNumber,
          laneId,
          targetProfileFromTargetId(activeChannelRef.current.targetName),
          data.score,
        );
        setActiveChannel((prev) => ({
          ...prev,
          shots: prev.shots.map((s) =>
            s.id === updatedShot.id ? updatedShot : s,
          ),
        }));
        return;
      }
    },
    [laneId, isAr, triggerSuccessBanner, restoreShots, restoreSessionFromApi],
  );

  const handleTargetClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (isShotPending) return;
      if (sessionStatus !== "ACTIVE") {
        triggerSuccessBanner(
          isAr ? "تنبيه: الجلسة غير نشطة." : "Alert: No active session.",
        );
        return;
      }
      const rect = targetSvgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { x: xRaw, y: yRaw } = clickToSensorCoords(
        e.clientX,
        e.clientY,
        rect,
        laneId,
      );

      // POST /api/debug/simulate-shot — ports the old backend's
      // /api/debug/simulate-shot. Scores and persists directly against
      // whatever's armed on this lane, keyed by laneId alone: no target IP
      // configuration needed, and no Electron/UDP dependency either, so this
      // works from a plain browser tab. clickToSensorCoords already returns
      // wire-format values, so a click and a real hit score identically.
      setIsShotPending(true);
      try {
        await api.post(`/debug/simulate-shot`, { laneId, x: xRaw, y: yRaw });
      } catch (err) {
        triggerSuccessBanner(
          isAr
            ? "فشل إرسال الطلقة."
            : `Simulated shot failed: ${(err as Error).message}`,
        );
      }
      setIsShotPending(false);
    },
    [isShotPending, sessionStatus, laneId, isAr, triggerSuccessBanner],
  );

  const handleSimulateShot = useCallback(async () => {
    if (isShotPending) return;
    if (sessionStatus !== "ACTIVE") {
      triggerSuccessBanner(
        isAr ? "تنبيه: الجلسة غير نشطة." : "Alert: No active session.",
      );
      return;
    }

    setIsShotPending(true);
    // No click position to work from here, so land it near the board centre
    // with a small random spread — same intent as simulate-shots.ts's
    // randomCoord(), just triggered from the UI instead of the CLI.
    const xBoard = Math.round((Math.random() - 0.5) * 200);
    const yBoard = Math.round((Math.random() - 0.5) * 200);
    const { x, y } = boardMmToSensorCoords(xBoard, yBoard, laneId);
    try {
      await api.post(`/debug/simulate-shot`, { laneId, x, y });
    } catch (err) {
      triggerSuccessBanner(
        isAr
          ? "فشل إرسال الطلقة."
          : `Simulated shot failed: ${(err as Error).message}`,
      );
    }
    setIsShotPending(false);
  }, [isShotPending, sessionStatus, laneId, isAr, triggerSuccessBanner]);

  const isArabic = language === "ar";

  if (sessionStatus === "IDLE") {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white font-mono p-6 relative overflow-hidden select-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-zinc-900 rounded-full opacity-40 pointer-events-none flex items-center justify-center">
          <div className="w-[400px] h-[400px] border border-zinc-900 rounded-full flex items-center justify-center">
            <div className="w-[200px] h-[200px] border border-zinc-900 rounded-full"></div>
          </div>
        </div>

        <div className="z-10 text-center space-y-6 max-w-md">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-lg">
            <Target className="w-7 h-7 text-amber-500 animate-pulse" />
          </div>

          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-widest text-zinc-300">
              LANE <span className="text-amber-500">{laneId}</span>
            </h1>
            <p className="admin-text-sm uppercase tracking-widest text-zinc-500 font-bold">
              Hardware Terminal Online
            </p>
          </div>

          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex items-center gap-3 text-left">
            <MonitorSmartphone className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="admin-text-sm text-zinc-400 leading-relaxed font-sans">
              Device authenticated via fixed network routing.
              <br /> Standing by for range officer configuration details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col flex-grow">
      <AnimatePresence>
        {bannerMsg && (
          <motion.div
            initial={{ opacity: 0, y: -45, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.95 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl border shadow-xl bg-[#1C1F26] border-emerald-500/30 text-emerald-400 font-mono admin-text-sm font-bold flex items-center gap-2.5"
          >
            <span>{bannerMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center font-mono admin-text-sm text-white">
        <span className="font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
          ● LANE {laneId} ACTIVE
        </span>
        <span className="text-zinc-400">
          SHOOTER:{" "}
          <strong className="text-white font-sans uppercase tracking-wider">
            {session?.shooterName || activeChannel.name}
          </strong>
        </span>
        <span className="text-zinc-400">
          LIMIT:{" "}
          {session?.bulletLimit ? `${session.bulletLimit} RDS` : "UNLIMITED"}
        </span>
      </div>

      <ShooterDashboard
        activeChannel={activeChannel}
        assignedLaneId={laneId}
        loggedInShooter={session?.shooterName || activeChannel.name}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        language={language}
        setLanguage={setLanguage}
        zoomLevel={zoomLevel}
        changeZoom={changeZoom}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        selectedShotId={selectedShotId}
        setSelectedShotId={setSelectedShotId}
        targetContainerRef={targetContainerRef}
        targetSvgRef={targetSvgRef}
        handleTargetClick={handleTargetClick}
        onSimulateShot={handleSimulateShot}
        isSimulatingShot={isShotPending}
        triggerSuccessBanner={triggerSuccessBanner}
      />
    </div>
  );
}
