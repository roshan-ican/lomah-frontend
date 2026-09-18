import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AlertTriangle,
  Camera,
  LoaderCircle,
  MonitorSmartphone,
  ScanLine,
  ShieldCheck,
  Target,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { io, Socket } from "socket.io-client";
import type { ActiveShooterChannel, Session } from "../types";
import type { RoomAck, WebSocketEvent } from "@shared/types/events";
import { resolveDisplayStage } from "../utils/helper";
import {
  boardMmToSensorCoords,
  mapRawShotToDisplay,
  mergeDisplayShots,
} from "../utils/shotCoordinates";
import { targetProfileFromTargetId } from "../utils/targetProfile";
import { clickToSensorCoords } from "../utils/shotCoordinates";
import {
  api,
  ApiError,
  apiFetchJson,
  BACKEND_URL,
  getAuthToken,
  syncServerClock,
} from "../utils/api";
import { shooterWaitUrl, stationUrl } from "../utils/shooterNavigation";
import { getOrCreateDeviceId } from "../utils/deviceIdentity";
import { ShooterDashboard } from "../modules/shooter/components/ShooterDashboard";
import { useSessionStore } from "../store/sessionStore";
import { useLaneOffsets } from "../hooks/useLaneOffsets";
import { clampTargetZoom } from "../utils/targetZoom";

interface StationSession {
  status: "IDLE" | "ACTIVE" | "PAUSED" | "COMPLETED";
  laneId: number;
  sessionId: string | null;
  shooterName: string | null;
  requiresFaceVerification?: boolean;
  stageId?: string;
  stageOrder?: number;
  targetId?: string;
  profileType?: "FIGURE" | "CIRCULAR";
  bulletLimit?: number;
  durationSeconds?: number;
  startedAt?: string;
  totalPausedMs?: number;
  notes?: string;
}

type RecognitionStatus =
  "matched" | "unknown" | "no_face" | "camera_error" | "processing_error";

interface FaceRecognitionResult {
  approved: boolean;
  status: RecognitionStatus;
  person: string | null;
  distance: number | null;
  cameraIndex: number;
  framesScanned: number;
  message: string;
}

type FaceRegistrationView = "front" | "side";
type FaceGateMode = "loading" | "register" | "verify";
const REGISTRATION_CAPTURE_ATTEMPTS = 5;
const VERIFICATION_CAPTURE_ATTEMPTS = 5;

interface FaceRegistrationStatus {
  registered: boolean;
  capturedViews: FaceRegistrationView[];
}

interface FaceRegistrationResult {
  complete: boolean;
  capturedViews: FaceRegistrationView[];
  message: string;
}

type VerificationState = "idle" | "scanning" | "approved" | "rejected";
type CameraState = "connecting" | "ready" | "error";

interface FaceVerificationGateProps {
  laneId: number;
  expectedShooter: string;
  isAr: boolean;
  mode: FaceGateMode;
  registrationView: FaceRegistrationView;
  state: VerificationState;
  message: string | null;
  cameraState: CameraState;
  cameraMessage: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onScan: () => void;
}

function FaceVerificationGate({
  laneId,
  expectedShooter,
  isAr,
  mode,
  registrationView,
  state,
  message,
  cameraState,
  cameraMessage,
  videoRef,
  onScan,
}: FaceVerificationGateProps) {
  const scanning = state === "scanning";
  const busy = scanning || mode === "loading";
  const actionLabel =
    mode === "loading"
      ? isAr
        ? "جارٍ فحص ملف الوجه..."
        : "Checking face profile..."
      : scanning
        ? mode === "register"
          ? isAr
            ? "جارٍ حفظ صورة الوجه..."
            : "Saving face..."
          : isAr
            ? "جارٍ فحص الوجه..."
            : "Scanning face..."
        : mode === "register"
          ? registrationView === "front"
            ? isAr
              ? "تسجيل الوجه الأمامي"
              : "Register front face"
            : isAr
              ? "تسجيل الوجه الجانبي"
              : "Register side face"
          : isAr
            ? "ابدأ التحقق من الوجه"
            : "Verify face";
  const guidance =
    mode === "register"
      ? registrationView === "front"
        ? isAr
          ? "انظر مباشرة إلى الكاميرا، ثم التقط الصورة الأمامية."
          : "Look straight at the camera, then capture the front view."
        : isAr
          ? "أدر وجهك قليلاً إلى الجانب مع إبقاء الوجه واضحاً."
          : "Turn slightly to the side while keeping your face clearly visible."
      : isAr
        ? "ضع وجهك أمام كاميرا جهاز الرامي، ثم ابدأ التحقق."
        : "Face the shooter device camera, then start verification.";

  return (
    <div
      className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-5 font-mono"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-lg rounded-2xl border border-emerald-500/20 bg-zinc-900/80 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-emerald-400 uppercase">
                {mode === "register"
                  ? isAr
                    ? "تسجيل وجه الرامي"
                    : "Shooter face registration"
                  : isAr
                    ? "التحقق من هوية الرامي"
                    : "Shooter identity check"}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {isAr ? `الحارة ${laneId}` : `Lane ${laneId}`}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md border border-zinc-700 bg-zinc-950 text-xs text-zinc-400">
            {mode === "register"
              ? registrationView.toUpperCase()
              : "FRONT CAMERA"}
          </span>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="relative mx-auto aspect-[4/3] max-w-sm overflow-hidden rounded-xl border border-zinc-700 bg-black flex items-center justify-center">
            <div className="absolute z-10 inset-4 border border-emerald-500/20 rounded-lg" />
            <div className="absolute z-10 inset-x-[20%] inset-y-[14%] rounded-[45%] border border-dashed border-emerald-400/50" />
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute z-0 inset-0 w-full h-full object-cover -scale-x-100 ${
                cameraState === "ready" ? "opacity-100" : "opacity-0"
              }`}
            />
            {cameraState !== "ready" && (
              <Camera
                className={`relative z-10 w-12 h-12 ${scanning ? "text-emerald-400" : "text-zinc-600"}`}
              />
            )}
            {scanning && (
              <motion.div
                className="absolute z-20 left-4 right-4 h-px bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.95)]"
                animate={{ top: ["10%", "90%", "10%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
            )}
            <div className="absolute z-20 bottom-3 left-3 right-3 flex items-center justify-between text-[0.65rem] tracking-wider text-zinc-300 drop-shadow-md">
              <span>
                {isAr ? "كاميرا جهاز الرامي" : "SHOOTER DEVICE CAMERA"}
              </span>
              <span>
                {busy
                  ? mode === "loading"
                    ? "CHECKING"
                    : mode === "register"
                      ? "SAVING"
                      : "SCANNING"
                  : state === "approved"
                    ? "VERIFIED"
                    : cameraState === "ready"
                      ? "READY"
                      : cameraState === "error"
                        ? "UNAVAILABLE"
                        : "CONNECTING"}
              </span>
            </div>
          </div>

          <div className="text-center space-y-1.5">
            <p className="text-sm text-zinc-400">
              {isAr ? "الرامي المتوقع" : "Expected shooter"}
            </p>
            <p className="text-xl font-black tracking-wider text-white uppercase">
              {expectedShooter}
            </p>
            <p className="text-xs leading-relaxed text-zinc-500 font-sans">
              {guidance}
            </p>
          </div>

          {cameraState === "error" && cameraMessage && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 flex items-start gap-2 text-red-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{cameraMessage}</span>
            </div>
          )}

          {state === "rejected" && message && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {state === "approved" && message && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 flex items-start gap-2 text-emerald-300 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {state === "idle" && message && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sky-300 text-xs">
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={onScan}
            disabled={busy || cameraState !== "ready"}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-3 px-4 font-black text-sm tracking-wider uppercase transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {busy ? (
              <LoaderCircle className="w-4 h-4 animate-spin" />
            ) : mode === "register" ? (
              <Camera className="w-4 h-4" />
            ) : (
              <ScanLine className="w-4 h-4" />
            )}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
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
  const bootstrapLaneId = new URLSearchParams(window.location.search).get(
    "laneId",
  );
  const laneId = parseInt(
    bootstrapLaneId || window.location.pathname.split("/station/")[1] || "1",
    10,
  );
  const faceVerificationStorageKey = `lomah_face_verified_session:${laneId}`;

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
  const [verifiedSessionId, setVerifiedSessionId] = useState<string | null>(
    () => sessionStorage.getItem(faceVerificationStorageKey),
  );
  const [verificationState, setVerificationState] =
    useState<VerificationState>("idle");
  const [verificationMessage, setVerificationMessage] = useState<string | null>(
    null,
  );
  const [faceGateMode, setFaceGateMode] = useState<FaceGateMode>("loading");
  const [registrationView, setRegistrationView] =
    useState<FaceRegistrationView>("front");
  const [cameraState, setCameraState] = useState<CameraState>("connecting");
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);

  const [zoomLevel, setZoomLevel] = useState(0.68);
  const [showGrid, setShowGrid] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [isShotPending, setIsShotPending] = useState(false);

  const targetContainerRef = useRef<HTMLDivElement | null>(null);
  const targetSvgRef = useRef<SVGSVGElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeChannelRef = useRef(activeChannel);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceCameraStreamRef = useRef<MediaStream | null>(null);
  /** Server-minted device key, same one ShooterWait used before the redirect —
   *  needed to join the device room so a reassignment push lands here. */
  const deviceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  useEffect(() => {
    setVerificationState("idle");
    setVerificationMessage(null);
    setFaceGateMode("loading");
    setRegistrationView("front");
  }, [activeChannel.sessionId]);

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
      const record = await api.get<Session | null>(
        `/sessions/by-lane/${laneId}`,
      );
      if (!record) return;
      const stage = resolveDisplayStage(record);
      const shots = stage?.shots ?? [];
      if (!shots.length) return;

      const profile =
        stage?.profileType ?? targetProfileFromTargetId(stage?.targetId);
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
        requiresFaceVerification: record.requiresFaceVerification,
        stageId: stage?.id,
        stageOrder: stage?.order,
        targetId: stage?.targetId,
        profileType: stage?.profileType,
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
        profileType: stage?.profileType ?? prev.profileType,
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
      const record = await api.get<Session | null>(
        `/sessions/by-lane/${laneId}`,
      );
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
      const record = await api.get<Session | null>(
        `/sessions/by-lane/${laneId}`,
      );
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
      const target = Math.round((prev + factor) * 100) / 100;
      return clampTargetZoom(target);
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
      (import.meta.env.VITE_WS_URL ?? BACKEND_URL) ||
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
          }>("/auth/connect", { deviceId: getOrCreateDeviceId() });
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
          window.location.href = shooterWaitUrl();
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
          requiresFaceVerification: data.requiresFaceVerification,
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
          profileType: data.profileType ?? prev.profileType,
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
          profileType: data.profileType ?? prev.profileType,
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
          activeChannelRef.current.profileType ??
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
          activeChannelRef.current.profileType ??
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


  const currentSessionId =
    activeChannel.sessionId ?? session?.sessionId ?? null;
  const expectedShooter = (
    session?.shooterName ||
    activeChannel.name ||
    ""
  ).trim();
  const sessionRequiresIdentity =
    currentSessionId !== null &&
    (activeChannel.sessionStatus === "CREATED" ||
      activeChannel.sessionStatus === "ACTIVE" ||
      activeChannel.sessionStatus === "PAUSED");
  const requiresFaceVerification =
    (session?.requiresFaceVerification ?? true) &&
    sessionRequiresIdentity &&
    verifiedSessionId !== currentSessionId;

  useEffect(() => {
    if (!currentSessionId) return;

    const storedSessionId = sessionStorage.getItem(faceVerificationStorageKey);
    if (storedSessionId === currentSessionId) {
      setVerifiedSessionId(currentSessionId);
      return;
    }

    sessionStorage.removeItem(faceVerificationStorageKey);
    setVerifiedSessionId(null);
  }, [currentSessionId, faceVerificationStorageKey]);

  useEffect(() => {
    if (!requiresFaceVerification || !expectedShooter) return;

    let cancelled = false;
    const loadRegistration = async () => {
      setFaceGateMode("loading");
      setVerificationState("idle");
      setVerificationMessage(null);
      const deviceId = getOrCreateDeviceId();

      try {
        // No shooter login: reconnecting the durable browser device lets the
        // backend confirm that the admin assigned it to this lane.
        await api.post("/auth/connect", { deviceId });
        const status = await apiFetchJson<FaceRegistrationStatus>(
          `/api/face-recognition/registration/${laneId}`,
          { headers: { "X-Device-Id": deviceId } },
        );
        if (cancelled) return;

        if (status.registered) {
          setFaceGateMode("verify");
          return;
        }

        setFaceGateMode("register");
        setRegistrationView(
          status.capturedViews.includes("front") ? "side" : "front",
        );
      } catch (error) {
        if (cancelled) return;
        setVerificationState("rejected");
        setVerificationMessage(
          error instanceof Error
            ? error.message
            : isAr
              ? "تعذر فحص تسجيل الوجه."
              : "Could not check face registration.",
        );
      }
    };

    void loadRegistration();
    return () => {
      cancelled = true;
    };
  }, [expectedShooter, isAr, laneId, requiresFaceVerification]);

  useEffect(() => {
    let cancelled = false;

    const stopCamera = (stream: MediaStream | null) => {
      stream?.getTracks().forEach((track) => track.stop());
    };

    stopCamera(faceCameraStreamRef.current);
    faceCameraStreamRef.current = null;
    if (faceVideoRef.current) faceVideoRef.current.srcObject = null;

    if (!requiresFaceVerification) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraMessage(
        window.electronAPI?.isElectron
          ? isAr
            ? "لم يتمكن تطبيق LOMAH من تشغيل الكاميرا. تحقق من إذن كاميرا Windows ثم أعد فتح التطبيق."
            : "LOMAH could not expose the camera. Check Windows camera permission for desktop apps, then reopen LOMAH."
          : isAr
            ? `تم حظر الكاميرا على ${window.location.origin}. افتح صفحة الرامي عبر HTTPS.`
            : `Camera access is blocked on insecure ${window.location.origin}. Open the shooter page over HTTPS or use the packaged LOMAH shooter app.`,
      );
      return;
    }

    setCameraState("connecting");
    setCameraMessage(null);

    const openCamera = async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { exact: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stopCamera(stream);
          return;
        }

        faceCameraStreamRef.current = stream;
        const video = faceVideoRef.current;
        if (!video) throw new Error("Camera preview is not ready");
        video.srcObject = stream;
        await video.play();
        setCameraState("ready");
      } catch (error) {
        stopCamera(stream);
        if (cancelled) return;
        setCameraState("error");
        const browserError =
          error instanceof DOMException
            ? `${error.name}${error.message ? `: ${error.message}` : ""}`
            : error instanceof Error
              ? error.message
              : "Unknown camera error";
        setCameraMessage(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? isAr
              ? "تم رفض إذن الكاميرا. اسمح للموقع باستخدام الكاميرا ثم أعد تحميل الصفحة."
              : "Camera permission was denied. Allow camera access and reload the page."
            : isAr
              ? `تعذر فتح الكاميرا الأمامية على جهاز الرامي: ${browserError}`
              : `Could not open the front camera on the shooter device: ${browserError}`,
        );
      }
    };

    void openCamera();
    return () => {
      cancelled = true;
      stopCamera(faceCameraStreamRef.current);
      faceCameraStreamRef.current = null;
    };
  }, [currentSessionId, isAr, requiresFaceVerification]);

  const captureFaceFrame = useCallback(async (): Promise<Blob> => {
    const video = faceVideoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error("The shooter camera is not ready yet");
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("The shooter camera did not provide a frame");
    }

    // Crop around the on-screen guide so the detector receives a larger face
    // and less background without increasing the uploaded JPEG size.
    const cropWidth = Math.round(sourceWidth * 0.8);
    const cropHeight = Math.round(sourceHeight * 0.9);
    const cropX = Math.round((sourceWidth - cropWidth) / 2);
    const cropY = Math.round((sourceHeight - cropHeight) / 2);
    const width = Math.min(cropWidth, 960);
    const height = Math.round((cropHeight / cropWidth) * width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not capture the camera frame");
    context.drawImage(
      video,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height,
    );

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Could not encode the camera frame")),
        "image/jpeg",
        0.82,
      );
    });
  }, []);

  const performFaceAction = async (): Promise<void> => {
    if (!currentSessionId || verificationState === "scanning") return;
    if (faceGateMode === "loading") return;
    if (!expectedShooter || expectedShooter === "Guest Shooter") {
      setVerificationState("rejected");
      setVerificationMessage(
        isAr
          ? "لم يعيّن المشرف رامياً لهذه الجلسة بعد."
          : "The range officer has not assigned a shooter to this session.",
      );
      return;
    }

    setVerificationState("scanning");
    setVerificationMessage(null);

    try {
      const deviceId = getOrCreateDeviceId();

      if (faceGateMode === "register") {
        let saved: FaceRegistrationResult | null = null;
        for (
          let attempt = 0;
          attempt < REGISTRATION_CAPTURE_ATTEMPTS;
          attempt++
        ) {
          const frame = await captureFaceFrame();
          try {
            saved = await apiFetchJson<FaceRegistrationResult>(
              `/api/face-recognition/register/${laneId}/${registrationView}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "image/jpeg",
                  "X-Device-Id": deviceId,
                },
                body: frame,
              },
            );
            break;
          } catch (error) {
            const transientCaptureFailure =
              error instanceof ApiError &&
              error.statusCode === 422 &&
              !/person name/i.test(error.message);
            if (
              !transientCaptureFailure ||
              attempt === REGISTRATION_CAPTURE_ATTEMPTS - 1
            ) {
              throw error;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 220));
          }
        }
        if (!saved) throw new Error("Could not capture a usable face image");

        setVerificationState("idle");
        if (saved.complete) {
          setFaceGateMode("verify");
          setRegistrationView("front");
          setVerificationMessage(
            isAr
              ? "اكتمل تسجيل الوجه. تحقق من الوجه للمتابعة."
              : "Registration complete. Verify the face to continue.",
          );
        } else {
          setRegistrationView("side");
          setVerificationMessage(
            isAr
              ? "تم حفظ الصورة الأمامية. أدر وجهك قليلاً للصورة الجانبية."
              : "Front view saved. Turn slightly for the side view.",
          );
        }
        return;
      }

      let result: FaceRecognitionResult | null = null;
      for (
        let attempt = 0;
        attempt < VERIFICATION_CAPTURE_ATTEMPTS;
        attempt++
      ) {
        const frame = await captureFaceFrame();
        result = await apiFetchJson<FaceRecognitionResult>(
          `/api/face-recognition/check-frame/${laneId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "image/jpeg",
              "X-Device-Id": deviceId,
            },
            body: frame,
          },
        );

        if (
          result.status !== "no_face" ||
          attempt === VERIFICATION_CAPTURE_ATTEMPTS - 1
        ) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
      if (!result) throw new Error("Could not capture a usable face image");
      const recognized = result.person?.trim() ?? "";
      const identityMatches =
        recognized.toLowerCase() === expectedShooter.toLowerCase();

      if (result.approved === true && recognized && identityMatches) {
        setVerificationState("approved");
        setVerificationMessage(
          isAr
            ? `تم التحقق من هوية ${expectedShooter}`
            : `${expectedShooter} verified`,
        );
        triggerSuccessBanner(
          isAr
            ? `تم التحقق من هوية ${expectedShooter}`
            : `${expectedShooter} verified`,
        );
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        if (activeChannelRef.current.sessionId === currentSessionId) {
          sessionStorage.setItem(faceVerificationStorageKey, currentSessionId);
          setVerifiedSessionId(currentSessionId);
        }
        return;
      }

      setVerificationState("rejected");
      setVerificationMessage(
        result.approved === true && recognized
          ? isAr
            ? `تم التعرف على ${recognized}، لكن الجلسة مخصصة لـ ${expectedShooter}.`
            : `Recognized ${recognized}, but this session is assigned to ${expectedShooter}.`
          : result.message ||
              (isAr ? "لم يتم اعتماد الوجه." : "Face was not approved."),
      );
    } catch (error) {
      setVerificationState("rejected");
      setVerificationMessage(
        error instanceof Error
          ? error.message
          : isAr
            ? "تعذر تشغيل خدمة التعرف على الوجه."
            : "Face recognition service could not be reached.",
      );
    }
  };

  if (requiresFaceVerification) {
    return (
      <FaceVerificationGate
        laneId={laneId}
        expectedShooter={expectedShooter || (isAr ? "غير معيّن" : "Unassigned")}
        isAr={isAr}
        mode={faceGateMode}
        registrationView={registrationView}
        state={verificationState}
        message={verificationMessage}
        cameraState={cameraState}
        cameraMessage={cameraMessage}
        videoRef={faceVideoRef}
        onScan={() => void performFaceAction()}
      />
    );
  }

  if (sessionStatus === "IDLE" && activeChannel.sessionStatus !== "CREATED") {
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
        <span
          className={`font-bold flex items-center gap-1.5 ${
            sessionStatus === "ACTIVE"
              ? "text-emerald-400 animate-pulse"
              : sessionStatus === "PAUSED"
                ? "text-amber-400"
                : "text-cyan-400"
          }`}
        >
          ● LANE {laneId}{" "}
          {sessionStatus === "ACTIVE"
            ? "ACTIVE"
            : sessionStatus === "PAUSED"
              ? "PAUSED"
              : "VERIFIED • WAITING FOR START"}
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
