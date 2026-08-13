import { useEffect, useState, useCallback, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { motion } from "motion/react";
import { Target, ShieldAlert, Wifi, CheckCircle2, Loader2 } from "lucide-react";
import { LanguageSwitcher } from "./common/LanguageSwitcher";
import { ThemeSwitcher } from "./common/ThemeSwitcher";
import { translations } from "../translations";
import {
  DEFAULT_ADMIN_PORT,
  type AdminEndpoint,
  normalizeHost,
  probeLocalAdmin,
} from "../utils/adminConnection";
import { stationUrl } from "../utils/shooterNavigation";
import { platform } from "@/src/utils/platform";

type Status =
  | "idle"
  | "scanning"
  | "connecting"
  | "connected"
  | "manual"
  | "error";

export function ShooterWait() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [adminHost, setAdminHost] = useState("");
  const [adminPort, setAdminPort] = useState(DEFAULT_ADMIN_PORT);
  // Server-minted identity for this device, echoed back when joining the
  // socket's device room. The device cannot derive this itself — for a tablet
  // that sends no deviceId the key is its IP, which it has no way to see.
  const [deviceKey, setDeviceKey] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("lomah_theme");
    if (stored === "light") return false;
    if (stored === "dark") return true;
    return true;
  });
  const [language, setLanguage] = useState<"en" | "ar">("en");

  const isAr = language === "ar";
  const t = translations[language];
  const isElectron = platform.isDesktop;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("lomah_theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const connectToAdmin = useCallback(
    async (host: string, port = DEFAULT_ADMIN_PORT) => {
      const cleanHost = normalizeHost(host);
      if (!cleanHost) {
        setError("Invalid admin address.");
        setStatus("manual");
        return;
      }

      setError("");
      setStatus("connecting");
      setAdminHost(cleanHost);
      setAdminPort(port);

      try {
        const res = await fetch(`http://${cleanHost}:${port}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error("unhealthy");
        setStatus("connected");
        const connectRes = await fetch(
          `http://${cleanHost}:${port}/api/auth/connect`,
          {
            method: "POST",
            signal: AbortSignal.timeout(5000),
          },
        );
        if (connectRes.ok) {
          // sendSuccess wraps every payload in { success, statusCode, data },
          // so laneId lives under .data — reading it off the raw body (as this
          // did before) always yielded undefined and the redirect never fired,
          // leaving a correctly-bound device sitting on this screen.
          const body = await connectRes.json();
          const laneId = body?.data?.laneId ?? body?.laneId;
          const key = body?.data?.key ?? body?.key;
          if (key) setDeviceKey(String(key));
          if (laneId) {
            window.location.href = stationUrl(laneId, cleanHost, port);
            return;
          }
        }
      } catch {
        setError(
          isAr
            ? `فشل الاتصال (${cleanHost}:${port}). تأكد أن المشرف يعمل وأن الجدار الناري يسمح بالاتصال.`
            : `Connection failed (${cleanHost}:${port}). Ensure admin backend is running and reachable.`,
        );
        setStatus("manual");
      }
    },
    [isAr],
  );

  // Heartbeat: keeps this device listed as connected on the admin, and doubles
  // as the late-binding path. A device that reaches the admin before anyone has
  // bound its address gets no lane and waits here; the admin then sees it in
  // the lane-bindings panel and assigns it, and this poll picks up the lane on
  // its next tick and moves the device on. Without re-reading the response the
  // shooter would have to restart the app after every new binding.
  //
  // This is now the FALLBACK path, not the primary one: the socket effect below
  // pushes an assignment the instant the admin makes it. The poll stays because
  // a push is a live broadcast with no queue behind it — if the socket is
  // reconnecting, blocked, or the assignment landed in the gap before this
  // device joined its room, the poll is what still gets the tablet onto its
  // lane. It runs slowly for that reason: it is a safety net, not the mechanism.
  useEffect(() => {
    if (status !== "connected" || !adminHost) return;
    // The 3s request timeout is longer than the 2s tick, so a slow or stalled
    // response would otherwise let ticks stack up into a growing pile of
    // concurrent requests against an unreachable admin — exactly when the
    // network can least afford it. One poll in flight at a time; a tick that
    // arrives while the previous is still running is simply skipped.
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(
          `http://${adminHost}:${adminPort}/api/auth/connect`,
          { method: "POST", signal: AbortSignal.timeout(3000) },
        );
        if (!res.ok) return;
        const body = await res.json();
        const laneId = body?.data?.laneId ?? body?.laneId;
        if (laneId) {
          window.location.href = stationUrl(laneId, adminHost, adminPort);
        }
      } catch {
        /* transient — the next tick retries */
      } finally {
        inFlight = false;
      }
    };
    // Fire once immediately: the effect runs the moment the device reaches
    // "connected", and waiting a full tick to ask for the first time adds
    // latency to the common case where the admin assigned the lane before the
    // tablet ever finished connecting.
    void poll();
    const interval = setInterval(() => void poll(), 8000);
    return () => clearInterval(interval);
  }, [status, adminHost, adminPort]);

  // Live assignment push. The tablet joins a room keyed by the identity the
  // server handed it at /auth/connect, and the gateway emits into that room the
  // moment an admin binds it to a lane — so the handoff is immediate instead of
  // waiting on the poll above.
  //
  // No auth token: shooter tablets have no credentials by design, and
  // handleConnection admits anonymous sockets precisely so they can be reached
  // this way. An anonymous socket can never join the admin room.
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (status !== "connected" || !adminHost || !deviceKey) return;

    const socket = io(`http://${adminHost}:${adminPort}`, {
      // Assignment is a one-shot handoff, so a slow upgrade dance is wasted
      // time — go straight to the transport that carries the push.
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const join = () => {
      socket.emit("join-device", { key: deviceKey }, (ack?: { ok: boolean; error?: string }) => {
        if (ack && !ack.ok) {
          console.warn(`[WebSocket] join-device refused: ${ack.error}`);
        }
      });
    };
    // Re-join on every connect, not just the first: rooms live on the server
    // side of a single connection and are gone after a reconnect.
    socket.on("connect", join);

    socket.on("device:assigned", (event: { key?: string; laneId?: number | null }) => {
      // The room already scopes this, but a device that rejoined under a new
      // key could briefly still be in the old room — only act on our own.
      if (event?.key && event.key !== deviceKey) return;
      if (event?.laneId != null) {
        window.location.href = stationUrl(event.laneId, adminHost, adminPort);
      }
    });

    return () => {
      socket.off("connect", join);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, adminHost, adminPort, deviceKey]);

  const resolveAdminEndpoint =
    useCallback(async (): Promise<AdminEndpoint | null> => {
      if (isElectron) {
        const discovered = await platform.startDiscovery();
        if (discovered?.host) {
          return {
            host: normalizeHost(discovered.host),
            port: discovered.port || DEFAULT_ADMIN_PORT,
          };
        }
      }
      return probeLocalAdmin();
    }, [isElectron]);

  const startScan = async () => {
    setStatus("scanning");
    setError("");
    try {
      const endpoint = await resolveAdminEndpoint();
      if (endpoint) {
        await connectToAdmin(endpoint.host, endpoint.port);
      } else {
        setError(
          isAr
            ? "لم يُعثر على المشرف. جرّب الإدخال اليدوي (مثلاً 127.0.0.1 إذا كان على نفس الجهاز)."
            : "No admin found. Try manual connect (e.g. 127.0.0.1 if admin runs on this PC).",
        );
        setStatus("manual");
      }
    } catch {
      setError(
        isAr
          ? "فشل البحث. جرّب الإدخال اليدوي."
          : "Discovery failed. Try manual connect.",
      );
      setStatus("manual");
    }
  };

  const stopScan = async () => {
    try {
      await platform.cancelDiscovery();
    } catch {
      /* ignore */
    }
    setStatus("idle");
    setError("");
  };

  const backToAdmin = async () => {
    try {
      await platform.cancelDiscovery();
    } catch {
      /* ignore */
    }
    await platform.setMode("admin");
  };

  const handleManualConnect = async () => {
    setError("");
    const host = manualIp.trim();
    if (!host) return;
    if (isElectron) {
      await platform.manualConnect(host);
    }
    await connectToAdmin(host, DEFAULT_ADMIN_PORT);
  };

  useEffect(() => {
    const init = async () => {
      try {
        if (isElectron) {
          const mode = await platform.getCurrentMode();
          if (mode === "admin") {
            setIsAdmin(true);
            return;
          }
          const savedAdminHost = await platform.getAdminIp();
          if (savedAdminHost) {
            setManualIp(savedAdminHost);
            await connectToAdmin(savedAdminHost, DEFAULT_ADMIN_PORT);
            return;
          }
        }

        const host = window.location.hostname;
        if (host && host !== "127.0.0.1" && host !== "localhost") {
          await connectToAdmin(host, DEFAULT_ADMIN_PORT);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void init();
  }, [connectToAdmin, isElectron]);

  if (isAdmin) {
    window.location.replace("/");
    return null;
  }

  const cardClass = `p-5 rounded-2xl border ${
    isDarkMode ? "bg-[#121417] border-glass-border" : "bg-white border-gray-200"
  }`;

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden ${
        isDarkMode ? "bg-[#111316] text-gray-100" : "bg-page-bg text-gray-900"
      }`}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] border border-emerald-500/[0.04] dark:border-emerald-success/[0.07] rounded-full pointer-events-none select-none z-0 flex items-center justify-center">
        <div className="w-[380px] h-[380px] border border-emerald-500/[0.03] dark:border-emerald-success/[0.05] rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-emerald-500/20 rounded-full animate-ping" />
        </div>
      </div>

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-6 select-none">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-success/10 flex items-center justify-center border border-emerald-500/20 mb-3.5 shadow-sm">
            <Target className="w-6 h-6 text-emerald-500 animate-pulse" />
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-widest font-sans text-gray-800 dark:text-white uppercase">
            {t.brand}
          </h1>
          <p className="admin-admin-text-lg font-mono text-gray-500 mt-1">
            {isAr
              ? "محطة الرامي — الاتصال بالمشرف"
              : "Shooter terminal — connect to range control"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl admin-admin-text-lg font-mono font-bold text-rose-500 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className={cardClass}>
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="admin-text-lg font-mono text-gray-400">
                {isAr ? "جاري التهيئة..." : "Initializing..."}
              </p>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cardClass}
          >
            {status === "idle" && (
              <div className="space-y-4">
                <p className="text-center admin-admin-text-lg font-mono text-gray-400">
                  {isElectron
                    ? isAr
                      ? "ابحث عن حاسوب المشرف على الشبكة"
                      : "SCAN FOR THE ADMIN PC ON YOUR NETWORK"
                    : isAr
                      ? "اتصل بحاسوب المشرف للبدء"
                      : "CONNECT TO THE ADMIN PC TO BEGIN"}
                </p>
                {isElectron ? (
                  <button
                    type="button"
                    onClick={() => void startScan()}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Wifi className="w-4 h-4" />
                    {isAr ? "بحث عن المشرف" : "Scan for Admin"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus("manual")}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-lg transition-colors"
                  >
                    {isAr ? "اتصال بالمشرف" : "Connect to Admin"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStatus("manual")}
                  className="admin-admin-text-lg font-mono text-gray-400 hover:text-emerald-500 underline block w-full text-center"
                >
                  {isAr ? "إدخال IP يدوياً" : "Enter IP manually"}
                </button>
              </div>
            )}

            {(status === "scanning" || status === "connecting") && (
              <div className="flex flex-col items-center gap-4 py-4">
                <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="admin-text-lg font-mono text-gray-400">
                  {status === "scanning"
                    ? isAr
                      ? "جاري البحث عن المشرف..."
                      : "Scanning for admin..."
                    : isAr
                      ? "جاري الاتصال..."
                      : "Connecting..."}
                </p>
                {status === "scanning" && isElectron && (
                  <button
                    type="button"
                    onClick={() => void stopScan()}
                    className="px-4 py-2 rounded-lg admin-admin-text-lg font-mono font-bold text-rose-400 border border-rose-500/30 hover:bg-rose-500/10"
                  >
                    {isAr ? "إيقاف البحث" : "Stop Scan"}
                  </button>
                )}
              </div>
            )}

            {status === "manual" && (
              <div className="space-y-4">
                <p className="text-center admin-admin-text-lg font-mono text-gray-400">
                  {isAr
                    ? "أدخل عنوان IP لحاسوب المشرف"
                    : "ENTER THE ADMIN PC IP ADDRESS"}
                </p>
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  placeholder={
                    isAr ? "مثال: 127.0.0.1" : "e.g. 127.0.0.1 or 192.168.1.10"
                  }
                  className="w-full px-3 py-2.5 border rounded-lg admin-text-lg font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border text-gray-800 dark:text-[#bccac1] focus:outline-none focus:border-emerald-500 text-center"
                />
                <button
                  type="button"
                  onClick={() => void handleManualConnect()}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-lg transition-colors"
                >
                  {isAr ? "اتصال" : "Connect"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    setError("");
                  }}
                  className="admin-admin-text-lg font-mono text-gray-400 hover:text-emerald-500 underline block w-full text-center"
                >
                  {isAr ? "← رجوع" : "← Back"}
                </button>
              </div>
            )}

            {status === "connected" && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="admin-text-lg font-bold text-emerald-500">
                    {isAr ? "متصل بالمشرف" : "Connected to Admin"}
                  </p>
                  <p className="admin-admin-text-lg font-mono text-gray-400">
                    {isAr
                      ? "بانتظار تعيين الحارة من المشرف..."
                      : "Awaiting lane assignment from the range officer..."}
                  </p>
                  <Loader2 className="w-5 h-5 text-emerald-500/50 animate-spin" />
                </div>
              </div>
            )}
          </motion.div>
        )}

        <div className="flex justify-center items-center gap-3 mt-4">
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
          <ThemeSwitcher
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
          />
        </div>

        {isElectron && (
          <div className="flex gap-3 justify-center mt-4 pt-4 border-t border-gray-200 dark:border-glass-border">
            <button
              type="button"
              onClick={() => void backToAdmin()}
              className="px-4 py-2 rounded-lg admin-admin-text-lg font-mono font-bold text-gray-500 dark:text-gray-400 hover:text-emerald-500 border border-gray-200 dark:border-glass-border hover:border-emerald-500/30"
            >
              {isAr ? "← وضع المشرف" : "← Admin Mode"}
            </button>
            <button
              type="button"
              onClick={() => platform.quitApp()}
              className="px-4 py-2 rounded-lg admin-admin-text-lg font-mono font-bold text-rose-500 border border-rose-500/20 hover:bg-rose-500/10"
            >
              {isAr ? "✕ خروج" : "✕ Exit"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}