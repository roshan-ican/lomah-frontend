import { useEffect, useRef, useState } from "react";
import {
  Wifi,
  WifiOff,
  RotateCcw,
  Play,
  Square,
  Activity,
  Heart,
  ScanLine,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Target } from "../../../../types";

export interface SensorPacket {
  id: string;
  timestamp: Date;
  command: string;
  direction: "tx" | "rx";
  hex: string;
  ascii: string;
  status: "pending" | "success" | "error" | "info";
  description: string;
}

type ConsoleMode = "commissioning" | "live";

interface TargetSensorConsoleProps {
  target: Target | null;
  isAr: boolean;
  packets: SensorPacket[];
  isConnected: boolean;
  isArmed: boolean;
  isTesting: boolean;
  mode: ConsoleMode;
  onClear: () => void;
  onPlay: () => void;
  onStop: () => void;
  onHeartbeat: () => void;
  onDevData: (shot: number) => void;
  readonly?: boolean;
}

const COMMAND_NAMES: Record<string, string> = {
  P: "PLAY",
  S: "STOP",
  T: "SELF TEST",
  H: "HEARTBEAT",
  G: "GET WIPER",
  W: "WRITE WIPER",
  D: "DEV DATA",
  L: "LOCATION",
  M: "MODE",
  O: "OFFSET",
  R: "READ PARAMS",
};

const getStatusColor = (
  status: "pending" | "success" | "error" | "info",
): string => {
  switch (status) {
    case "success":
      return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
    case "error":
      return "text-rose-500 bg-rose-500/10 border-rose-500/30";
    case "pending":
      return "text-amber-500 bg-amber-500/10 border-amber-500/30";
    case "info":
      return "text-blue-500 bg-blue-500/10 border-blue-500/30";
  }
};

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
};

/** Tooltip text for each command — shown as title attribute. */
const COMMAND_TOOLTIPS: Record<string, string> = {
  P: "Play — arm the target and start detection",
  S: "Stop — disarm the target",
  T: "Self Test — run the board's internal timing check",
  H: "Heartbeat — ping the board to check if it is reachable",
  D: "Dev Data — query which sensors detected a specific shot",
};

export function TargetSensorConsole({
  target,
  isAr,
  packets,
  isConnected,
  isArmed,
  isTesting,
  mode,
  onClear,
  onPlay,
  onStop,
  onHeartbeat,
  onDevData,
}: TargetSensorConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [devShot, setDevShot] = useState(5);
  const [protocolOpen, setProtocolOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [packets]);

  const isCommissioning = mode === "commissioning";

  if (!target) {
    return (
      <div className="hidden md:flex flex-col w-80 border-l border-hud bg-hud-elevated p-4 items-center justify-center text-center">
        <Activity className="w-8 h-8 hud-text-muted mb-2 opacity-50" />
        <p className="admin-text-xs hud-text-muted">
          {isAr ? "اختر هدفاً لعرض البيانات المباشرة" : "Select a target to view live data"}
        </p>
      </div>
    );
  }

  return (
    <div className="hidden md:flex flex-col w-80 border-l border-hud bg-hud-elevated">
      {/* Header */}
      <div className="border-b border-hud p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="admin-text-sm font-mono font-bold hud-text truncate">
              {target.label}
            </h3>
            <p className="admin-text-2xs hud-text-subtle">
              {target.ipAddress}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-emerald-500" />
            ) : (
              <WifiOff className="w-3 h-3 text-rose-500" />
            )}
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-1.5 flex-wrap admin-text-2xs">
          <span
            className={`px-2 py-0.5 rounded border font-mono ${
              isConnected
                ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                : "border-rose-500/30 text-rose-500 bg-rose-500/10"
            }`}
          >
            {isConnected ? (isAr ? "متصل" : "Connected") : (isAr ? "منقطع" : "Offline")}
          </span>
          <span
            className={`px-2 py-0.5 rounded border font-mono ${
              isArmed
                ? "border-amber-500/30 text-amber-500 bg-amber-500/10"
                : "border-hud-text-subtle/30 text-hud-text-subtle bg-hud/10"
            }`}
          >
            {isArmed ? (isAr ? "مسلَّح" : "Armed") : (isAr ? "معطّل" : "Disarmed")}
          </span>
          {isTesting && (
            <span className="px-2 py-0.5 rounded border font-mono border-blue-500/30 text-blue-500 bg-blue-500/10 animate-pulse">
              {isAr ? "اختبار..." : "Testing..."}
            </span>
          )}
        </div>
      </div>

      {/* Control Buttons */}
      <div className="border-b border-hud p-2 flex gap-1.5">
        <button
          type="button"
          onClick={onPlay}
          disabled={isArmed || isTesting}
          title={COMMAND_TOOLTIPS.P}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded admin-text-2xs font-mono font-bold hud-accent border border-current/30 bg-current/10 hover:bg-current/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-3 h-3" />
          <span>{isAr ? "تشغيل" : "Play"}</span>
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!isArmed || isTesting}
          title={COMMAND_TOOLTIPS.S}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded admin-text-2xs font-mono font-bold text-rose-500 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Square className="w-3 h-3" />
          <span>{isAr ? "إيقاف" : "Stop"}</span>
        </button>
        <button
          type="button"
          onClick={onClear}
          title={isAr ? "مسح السجل" : "Clear log"}
          className="px-2 py-1.5 rounded hud-text-subtle hover:bg-hud-elevated border border-transparent hover:border-hud transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

{/* Diagnostic Buttons */}
       <div className="border-b border-hud p-2 flex gap-1.5 text-2xs">
         <button
           type="button"
           onClick={onHeartbeat}
           disabled={isTesting}
           title={COMMAND_TOOLTIPS.H}
           className="flex-1 px-2 py-1 rounded admin-text-2xs font-mono hud-text-subtle hover:text-[var(--hud-accent)] hover:bg-[var(--hud-accent-bg)] disabled:opacity-50 transition-colors"
         >
           <Heart className="w-3 h-3 inline-block mr-0.5" />
           {isAr ? "نبض" : "H"}
         </button>
        {!isCommissioning && (
          <>
            <button
              type="button"
              onClick={() => onDevData(devShot)}
              disabled={isTesting}
              title={COMMAND_TOOLTIPS.D}
              className="flex-1 px-2 py-1 rounded admin-text-2xs font-mono hud-text-subtle hover:text-[var(--hud-accent)] hover:bg-[var(--hud-accent-bg)] disabled:opacity-50 transition-colors"
            >
              <ScanLine className="w-3 h-3 inline-block mr-0.5" />
              {isAr ? "بيانات" : "D"}
            </button>
            <input
              type="number"
              min="1"
              max="100"
              value={devShot}
              onChange={(e) => setDevShot(Math.max(1, parseInt(e.target.value) || 1))}
              title={isAr ? "رقم الطلقة" : "Shot number"}
              className="w-12 px-1 py-1 rounded admin-text-2xs font-mono bg-transparent border border-hud/40 hover:border-hud focus:border-[var(--hud-accent-border)] focus:bg-[var(--hud-elevated)] outline-none transition-colors disabled:opacity-50"
            />
          </>
        )}
        {/* No 'T' button here: each hardware row already carries a self-test
            control that reports its own outcome (Test → Passed / Failed / No
            reply). Two buttons firing the same 'T' round trip, one of which
            showed no result, was the confusing half. */}
      </div>

      {/* Protocol Map */}
      <div className="border-b border-hud">
        <button
          type="button"
          onClick={() => setProtocolOpen(!protocolOpen)}
          className="w-full flex items-center justify-between px-2 py-1.5 admin-text-2xs font-mono hud-text-subtle hover:text-[var(--hud-accent)] hover:bg-[var(--hud-accent-bg)] transition-colors"
        >
          <span className="flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            {isAr ? "بروتوكول الأوامر" : "Protocol Map"}
          </span>
          {protocolOpen ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
        {protocolOpen && (
          <div className="px-2 pb-2 space-y-0.5">
            <div className="flex items-center justify-between admin-text-2xs font-mono">
              <span className="hud-text-subtle">Play</span>
              <span className="hud-text-muted">P → Echo</span>
            </div>
            <div className="flex items-center justify-between admin-text-2xs font-mono">
              <span className="hud-text-subtle">Stop</span>
              <span className="hud-text-muted">S → Echo</span>
            </div>
            <div className="flex items-center justify-between admin-text-2xs font-mono">
              <span className="hud-text-subtle">Self Test</span>
              <span className="hud-text-muted">T → Status + X/Y</span>
            </div>
            <div className="flex items-center justify-between admin-text-2xs font-mono">
              <span className="hud-text-subtle">Heartbeat</span>
              <span className="hud-text-muted">H → Echo</span>
            </div>
            <div className="flex items-center justify-between admin-text-2xs font-mono">
              <span className="hud-text-subtle">Dev Data</span>
              <span className="hud-text-muted">D → Sensor bitmap</span>
            </div>
            <div className="flex items-center justify-between admin-text-2xs font-mono">
              <span className="hud-text-subtle">Read Wiper</span>
              <span className="hud-text-muted">G A/B → 5 values</span>
            </div>
            <div className="flex items-center justify-between admin-text-2xs font-mono">
              <span className="hud-text-subtle">Write Wiper</span>
              <span className="hud-text-muted">W → Updated page</span>
            </div>
          </div>
        )}
      </div>

      {/* Packet Log */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 p-2"
        style={{ fontSize: "10px" }}
      >
        {packets.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <p className="admin-text-2xs hud-text-muted">
              {isAr ? "لا توجد بيانات بعد" : "No packets yet"}
            </p>
          </div>
        ) : (
          packets.map((packet) => (
            <div
              key={packet.id}
              className={`border rounded p-1.5 space-y-0.5 font-mono ${getStatusColor(packet.status)}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-2xs opacity-75">
                  {formatTime(packet.timestamp)}
                </span>
                <span className="font-bold uppercase text-xs">
                  {COMMAND_NAMES[packet.command] || packet.command}
                </span>
                <span
                  className={`text-2xs px-1 rounded ${
                    packet.direction === "tx"
                      ? "bg-current/20 opacity-70"
                      : "bg-current/30"
                  }`}
                >
                  {packet.direction === "tx" ? "→" : "←"}
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-2xs opacity-80 break-all">
                  <span className="opacity-60">HEX: </span>
                  {packet.hex}
                </div>
                <div className="text-2xs opacity-70 break-all">
                  <span className="opacity-60">ASCII: </span>
                  {packet.ascii}
                </div>
              </div>
              <div className="text-2xs opacity-75">
                {packet.description}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
