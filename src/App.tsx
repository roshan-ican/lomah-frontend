// src/App.tsx
import React, { useState, useEffect, useRef, Suspense } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { CarriedCalibrationDialog } from "./components/common/CarriedCalibrationDialog";
import type { CalibrateMode } from "./types";
import { AuthStage, AUTH_STAGE_PATH, authStageFromPath } from "./types";
import { translations, TranslationSet } from "./translations";
import { clickToSensorCoords } from "./utils/shotCoordinates";
import { apiFetchJson, ApiError, BACKEND_URL, getAuthRole, api } from "./utils/api";
import { useNotifications } from "./hooks/useNotifications";
import { useLaneOffsets } from "./hooks/useLaneOffsets";
import { useSessionStore } from "./store/sessionStore";
import { useSessionActions } from "./hooks/useSessionActions";
import { useCalibration } from "./hooks/useCalibration";
import { useRealtimeChannels } from "./hooks/useRealtimeChannels";
import { useAuthFlow } from "./hooks/useAuthFlow";
import { createUnassignedShooterChannel } from "./utils/helper";
import { noLaneChannel } from "./store/channelMutations";

const ShooterDashboard = React.lazy(() =>
  import("./modules/shooter/components/ShooterDashboard").then((m) => ({
    default: m.ShooterDashboard,
  })),
);
const SuperAdminDashboard = React.lazy(() =>
  import("./modules/admin/components/SuperAdminDashboard").then((m) => ({
    default: m.SuperAdminDashboard,
  })),
);
const AdminDashboard = React.lazy(() =>
  import("./modules/admin/components/AdminDashboard").then((m) => ({
    default: m.AdminDashboard,
  })),
);
const AuthLayout = React.lazy(() =>
  import("./components/auth/AuthLayout").then((m) => ({
    default: m.AuthLayout,
  })),
);

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const authStage: AuthStage = authStageFromPath(location.pathname);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("lomah_theme");
    if (stored === "light") return false;
    if (stored === "dark") return true;
    return true;
  });
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const isAr = language === "ar";
  const t: TranslationSet = translations[language];

  const {
    banner,
    adminLogs,
    triggerSuccessBanner,
    triggerErrorBanner,
    addAdminLog,
  } = useNotifications();
  const { waitForLaneOffsets } = useLaneOffsets();

  const { channels } = useSessionStore();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("CH-1");
  const [loggedInUsername, setLoggedInUsername] = useState(
    () => localStorage.getItem("username") ?? "",
  );
  const [shooterAssignedLaneId, setShooterAssignedLaneId] = useState<
    number | null
  >(null);

  // Calibration / zoom
  const [zoomLevel, setZoomLevel] = useState<number>(0.68);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [profileType, setProfileType] = useState<"FIGURE" | "CIRCULAR">(
    "FIGURE",
  );
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [calibrateMode, setCalibrateMode] = useState<CalibrateMode>("off");
  const [isShotPending, setIsShotPending] = useState(false);
  const [calibrationLaneId, setCalibrationLaneId] = useState<number | null>(
    null,
  );

  const targetContainerRef = useRef<HTMLDivElement | null>(null);
  const targetSvgRef = useRef<SVGSVGElement | null>(null);

  // ─── Session action handlers (see hooks/useSessionActions.ts) ─────────────

  const {
    handleAdminCommand,
    handleCreateSession,
    handlePauseSession,
    handleStartOrResumeSession,
    handleResumeAllSessions,
    handlePauseAllSessions,
    handleEndSession,
    handleAdvanceSession,
    handleDiscardSession,
    executeDiscardSession,
    handleSaveFeedback,
    handleCancelSession,
    handleDiscardReadySession,
    discardConfirm,
    setDiscardConfirm,
    carriedCalibration,
    keepCarriedCalibration,
    resetCarriedCalibration,
    closeCarriedCalibration,
  } = useSessionActions({
    isAr,
    triggerSuccessBanner,
    triggerErrorBanner,
    addAdminLog,
    setProfileType,
  });

  // ─── First-shot calibration trigger ───────────────────────────────────────
  // Calibration is on-demand only: the admin opens it from the lane controls
  // whenever they choose and may pick ANY shot as the reference. The first shot
  // must NOT auto-pause the session or force calibration, so this is a no-op.
  // `onFirstShotFired` is still passed through to the WS hook above.

  const handleFirstShotFired = (_laneId: number) => {
    /* no-op: calibration is manual/on-demand */
  };

  const handleCalibrationDismiss = () => {
    if (calibrationLaneId != null) {
      handleStartOrResumeSession(`CH-${calibrationLaneId}`);
    }
    setCalibrationLaneId(null);
    setCalibrateMode("off");
  };

  // ─── Derived channel ─────────────────────────────────────────────────────

  const adminActiveChannel =
    channels.find((c) => c.id === selectedChannelId) ??
    channels[0] ??
    noLaneChannel();

  const shooterSessionChannel =
    shooterAssignedLaneId != null
      ? channels.find((c) => c.id === `CH-${shooterAssignedLaneId}`)
      : undefined;

  const activeChannel =
    authStage === "SHOOTER_BOARD"
      ? shooterSessionChannel
        ? shooterSessionChannel
        : createUnassignedShooterChannel(loggedInUsername)
      : adminActiveChannel;

  // ─── Realtime WS + channel sync (see hooks/useRealtimeChannels.ts) ─────────

  const { syncLaneFromApi, syncShooterAssignmentFromApi } = useRealtimeChannels(
    {
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
      onFirstShotFired: handleFirstShotFired,
    },
  );

  // ─── Theme / lang effects ────────────────────────────────────────────────

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

  // ─── Auth flow (see hooks/useAuthFlow.ts) ─────────────────────────────────

  const {
    authError,
    setAuthError,
    availableShooters,
    refreshShooters,
    handleAdminLogin,
    handleShooterConnect,
    handleLogout,
  } = useAuthFlow({
    authStage,
    isAr,
    navigate,
    setLoggedInUsername,
    setShooterAssignedLaneId,
    triggerSuccessBanner,
    syncShooterAssignmentFromApi,
  });

  // ─── Calibration handlers (see hooks/useCalibration.ts) ───────────────────

  const { handleShotsCalibrate, handleLaneCalibrate, handleSetOffset } =
    useCalibration({
      authStage,
      calibrateMode,
      selectedChannelId,
      isAr,
      addAdminLog,
      triggerSuccessBanner,
      syncLaneFromApi,
      onCalibrationComplete: () => {
        setCalibrationLaneId(null);
        setCalibrateMode("off");
      },
    });

  // ─── Zoom / target click ─────────────────────────────────────────────────

  const changeZoom = (factor: number) => {
    setZoomLevel((prev) => {
      const target = Math.round((prev + factor) * 100) / 100;
      return Math.min(2, Math.max(0.1, target));
    });
  };

  const handleTargetClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (isShotPending) return;

    const isAdmin = authStage === "ADMIN_BOARD";
    const isShooter = authStage === "SHOOTER_BOARD";

    if (!isAdmin && !isShooter) return;

    const laneId = isAdmin
      ? Number(adminActiveChannel.id.replace("CH-", ""))
      : shooterAssignedLaneId;

    if (laneId == null || isNaN(laneId)) {
      triggerErrorBanner(
        isAr
          ? "لم يتم تعيينك لحارة بعد. انتظر المشرف."
          : "You are not assigned to a lane yet. Await range officer.",
      );
      return;
    }

    const targetChannel = isAdmin ? adminActiveChannel : activeChannel;

    if (targetChannel.sessionStatus === "CREATED") {
      triggerErrorBanner(
        isAr
          ? "تنبيه: الجلسة لم تبدأ بعد. يرجى الانتظار لتنشيط الجلسة.."
          : "Alert: Session has not started yet. Awaiting Range Officer activation.",
      );
      return;
    }
    if (targetChannel.sessionStatus !== "ACTIVE") {
      triggerErrorBanner(
        isAr
          ? "تنبيه: الجلسة للحارة المحددة موقوفة مؤقتاً."
          : "Alert: Session for targeted lane is currently paused.",
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
    // POST /api/debug/simulate-shot — scores and persists directly against
    // whatever's armed on this lane, keyed by laneId alone: no target IP
    // configuration needed, and no Electron/UDP dependency either, so this
    // works from a plain browser tab. clickToSensorCoords already returns
    // wire-format values, so a click and a real hit score identically.
    setIsShotPending(true);
    try {
      await api.post(`/debug/simulate-shot`, { laneId, x: xRaw, y: yRaw });
    } catch (err) {
      triggerErrorBanner(
        isAr
          ? "فشل إرسال الطلقة."
          : `Simulated shot failed: ${(err as Error).message}`,
      );
    }
    setIsShotPending(false);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${isDarkMode ? "bg-[#0f1115] text-[#e2e2e6] selection:bg-emerald-500/20" : "bg-[#eef2f5] text-[#1e2023]"}`}
    >
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.tone}
            role={banner.tone === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: -45, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -25, scale: 0.95 }}
            className={`fixed top-5 left-1/2 -translate-x-1/2 z-[9999] max-w-[min(90vw,44rem)] px-5 py-3 rounded-xl border shadow-xl bg-[#1C1F26] font-mono admin-text-sm font-bold flex items-start gap-2.5 ${
              banner.tone === "error"
                ? "border-red-500/40 text-red-400"
                : "border-emerald-500/30 text-emerald-400"
            }`}
          >
            {banner.tone === "error" ? (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Check className="w-4 h-4 text-emerald-400 animate-bounce shrink-0 mt-0.5" />
            )}
            {/* Server rejections are full sentences naming the lane and the
                blocking session — they must wrap, not be clipped to one line. */}
            <span className="whitespace-pre-wrap break-words">
              {banner.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={discardConfirm.open}
        title={isAr ? "تأكيد التجاهل" : "Confirm Discard"}
        message={
          isAr
            ? "هل أنت متأكد أنك تريد تجاهل هذه الجلسة؟ سيتم حذف جميع الطلقات بشكل دائم."
            : "Are you sure you want to discard this session? All shots will be permanently deleted."
        }
        language={language}
        confirmLabel={isAr ? "تجاهل" : "Discard"}
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        variant="danger"
        onConfirm={executeDiscardSession}
        onCancel={() => setDiscardConfirm({ open: false, channelId: null })}
      />

      {/* Raised on a session's first start when the target still carries an
          offset from earlier work — see CarriedCalibrationDialog. */}
      <CarriedCalibrationDialog
        open={carriedCalibration.open}
        targetLabel={carriedCalibration.target?.label ?? ""}
        distanceM={carriedCalibration.target?.distanceM}
        offset={{
          x: carriedCalibration.target?.offsetXmm ?? 0,
          y: carriedCalibration.target?.offsetYmm ?? 0,
        }}
        language={language}
        busy={carriedCalibration.busy}
        onKeep={keepCarriedCalibration}
        onReset={resetCarriedCalibration}
        onCancel={closeCarriedCalibration}
      />

      <Suspense fallback={null}>
        <Routes>
          <Route
            path="/"
            element={
              <AuthLayout
                authStage="PORTAL"
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                language={language}
                setLanguage={setLanguage}
                isAr={isAr}
                t={t}
                authError={authError}
                onAdminSelect={() => {
                  navigate(AUTH_STAGE_PATH.LOGIN_ADMIN);
                  setAuthError(null);
                }}
                onShooterSelect={() => {
                  navigate(AUTH_STAGE_PATH.LOGIN_SHOOTER);
                  setAuthError(null);
                }}
                onBackToPortal={() => navigate(AUTH_STAGE_PATH.PORTAL)}
                onAdminLogin={handleAdminLogin}
                // Shooters do not authenticate — the typed name is ignored
                // and the device simply announces itself, then waits for the
                // range officer to assign it a lane. TODO(redesign): replace
                // ShooterLoginForm with a plain "connecting / waiting" screen.
                onShooterLogin={async () => {
                  await handleShooterConnect();
                }}
              />
            }
          />
          <Route
            path="/login/admin"
            element={
              <AuthLayout
                authStage="LOGIN_ADMIN"
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                language={language}
                setLanguage={setLanguage}
                isAr={isAr}
                t={t}
                authError={authError}
                onAdminSelect={() => {
                  navigate(AUTH_STAGE_PATH.LOGIN_ADMIN);
                  setAuthError(null);
                }}
                onShooterSelect={() => {
                  navigate(AUTH_STAGE_PATH.LOGIN_SHOOTER);
                  setAuthError(null);
                }}
                onBackToPortal={() => navigate(AUTH_STAGE_PATH.PORTAL)}
                onAdminLogin={handleAdminLogin}
                // Shooters do not authenticate — the typed name is ignored
                // and the device simply announces itself, then waits for the
                // range officer to assign it a lane. TODO(redesign): replace
                // ShooterLoginForm with a plain "connecting / waiting" screen.
                onShooterLogin={async () => {
                  await handleShooterConnect();
                }}
              />
            }
          />
          <Route
            path="/login/shooter"
            element={
              <AuthLayout
                authStage="LOGIN_SHOOTER"
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                language={language}
                setLanguage={setLanguage}
                isAr={isAr}
                t={t}
                authError={authError}
                onAdminSelect={() => {
                  navigate(AUTH_STAGE_PATH.LOGIN_ADMIN);
                  setAuthError(null);
                }}
                onShooterSelect={() => {
                  navigate(AUTH_STAGE_PATH.LOGIN_SHOOTER);
                  setAuthError(null);
                }}
                onBackToPortal={() => navigate(AUTH_STAGE_PATH.PORTAL)}
                onAdminLogin={handleAdminLogin}
                // Shooters do not authenticate — the typed name is ignored
                // and the device simply announces itself, then waits for the
                // range officer to assign it a lane. TODO(redesign): replace
                // ShooterLoginForm with a plain "connecting / waiting" screen.
                onShooterLogin={async () => {
                  await handleShooterConnect();
                }}
              />
            }
          />
          <Route
            path="/admin"
            element={
              !localStorage.getItem("token") ? (
                <Navigate to={AUTH_STAGE_PATH.LOGIN_ADMIN} replace />
              ) : getAuthRole() === "SUPER_ADMIN" ? (
                // Commissioning console — a wholly separate tree with no
                // session controls in it. See SuperAdminDashboard.
                <SuperAdminDashboard
                  isDarkMode={isDarkMode}
                  setIsDarkMode={setIsDarkMode}
                  language={language}
                  setLanguage={setLanguage}
                  triggerSuccessBanner={triggerSuccessBanner}
                  triggerErrorBanner={triggerErrorBanner}
                  addAdminLog={addAdminLog}
                  handleLogout={handleLogout}
                  adminLogs={adminLogs}
                />
              ) : (
                <AdminDashboard
                  channels={channels}
                  selectedChannelId={selectedChannelId}
                  setSelectedChannelId={setSelectedChannelId}
                  handleAdminCommand={handleAdminCommand}
                  onCreateSession={handleCreateSession}
                  onPauseSession={handlePauseSession}
                  onResumeSession={handleStartOrResumeSession}
                  onEndSession={handleEndSession}
                  onAdvanceSession={handleAdvanceSession}
                  onDiscardSession={handleDiscardSession}
                  onSaveFeedback={handleSaveFeedback}
                  onCancelSession={handleCancelSession}
                  onStartAllSessions={handleResumeAllSessions}
                  onPauseAllSessions={handlePauseAllSessions}
                  isDarkMode={isDarkMode}
                  setIsDarkMode={setIsDarkMode}
                  language={language}
                  setLanguage={setLanguage}
                  adminLogs={adminLogs}
                  triggerSuccessBanner={triggerSuccessBanner}
                  triggerErrorBanner={triggerErrorBanner}
                  handleLogout={handleLogout}
                  zoomLevel={zoomLevel}
                  changeZoom={changeZoom}
                  showGrid={showGrid}
                  setShowGrid={setShowGrid}
                  profileType={profileType}
                  setProfileType={setProfileType}
                  selectedShotId={selectedShotId}
                  setSelectedShotId={setSelectedShotId}
                  targetContainerRef={targetContainerRef}
                  calibrateMode={calibrateMode}
                  setCalibrateMode={setCalibrateMode}
                  onLaneCalibrate={handleLaneCalibrate}
                  onShotsCalibrate={handleShotsCalibrate}
                  availableShooters={availableShooters}
                  onDiscardReadySession={handleDiscardReadySession}
                  calibrationLaneId={calibrationLaneId}
                  setCalibrationLaneId={setCalibrationLaneId}
                  onCalibrationDismiss={handleCalibrationDismiss}
                  onSetOffset={handleSetOffset}
                  onRefreshShooters={refreshShooters}
                />
              )
            }
          />
          <Route
            path="/shooter"
            element={
              localStorage.getItem("token") ? (
                <ShooterDashboard
                  key={loggedInUsername || "shooter"}
                  loggedInShooter={loggedInUsername}
                  activeChannel={activeChannel}
                  assignedLaneId={shooterAssignedLaneId}
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
                  triggerSuccessBanner={triggerSuccessBanner}
                />
              ) : (
                <Navigate to={AUTH_STAGE_PATH.LOGIN_SHOOTER} replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
