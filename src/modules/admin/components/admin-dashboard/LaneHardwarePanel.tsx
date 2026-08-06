import { useEffect, useState } from "react";
import {
  RefreshCw,
  Plus,
  Trash2,
  X,
  Crosshair,
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { api, ApiError } from "../../../../utils/api";
import { TargetFacePreview } from "../../../../components/common/TargetFacePreview";
import { TargetSensitivityPanel } from "./TargetSensitivityPanel";
import { TargetSensorConsole, type SensorPacket } from "./TargetSensorConsole";
import type {
  Lane,
  LaneStatus,
  Target,
  TargetDevDataResult,
  TargetHeartbeatResult,
  TargetPlayResult,
  TargetProfileType,
  TargetSelfTestResult,
  TargetStopResult,
} from "../../../../types";
// The one router / one subnet convention this screen commissions against.
import {
  DEFAULT_TARGET_IP,
  DISTANCE_PRESETS_M,
  MAX_ADDRESSABLE_LANE,
  MAX_SLOTS_PER_LANE,
  RANGE_SUBNET,
  addressFor,
  labelFor,
  slotCode,
} from "../../../../utils/rangeAddressing";

interface Props {
  isAr: boolean;
  triggerSuccessBanner: (msg: string) => void;
  readOnly?: boolean;
  mode: "commissioning" | "live";
}

const PROFILES: TargetProfileType[] = ["FIGURE", "CIRCULAR"];

/** Best-effort printable rendering of a hex frame for the console's ASCII
 *  column — non-printable bytes become '.'. Purely display. */
function hexToAscii(hex: string | null | undefined): string {
  if (!hex) return "—";
  return hex
    .split(" ")
    .map((h) => {
      const byte = parseInt(h, 16);
      if (Number.isNaN(byte)) return "?";
      return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
    })
    .join("");
}

/** Statuses a human sets. OCCUPIED is written by the session lifecycle, so it
 *  is displayed when current but never offered as a choice. */
const SETTABLE_LANE_STATUSES: LaneStatus[] = [
  "AVAILABLE",
  "MAINTENANCE",
  "DISABLED",
];

function laneStatusLabel(status: LaneStatus, isAr: boolean): string {
  switch (status) {
    case "AVAILABLE":
      return isAr ? "متاحة" : "Online";
    case "OCCUPIED":
      return isAr ? "قيد الاستخدام" : "In use";
    case "MAINTENANCE":
      return isAr ? "صيانة" : "Maintenance";
    case "DISABLED":
      return isAr ? "معطّلة" : "Disabled";
  }
}

export function LaneHardwarePanel({
  isAr,
  triggerSuccessBanner,
  readOnly = false,
  mode,
}: Props) {
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [loading, setLoading] = useState(false);
  /** Row or lane currently mid-request, so exactly one control shows a spinner
   *  instead of the whole panel greying out. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Last self-test outcome per target. Deliberately NOT persisted: it says
   *  "the board answered a moment ago", which stops being true the instant
   *  someone unplugs it, so it is scoped to this sitting at the console. */
  const [testResults, setTestResults] = useState<
    Map<string, TargetSelfTestResult>
  >(new Map());
  /** Targets with a PLAY in flight. A set, not a single id, so testing a whole
   *  lane does not serialise behind one board's 4.5s retry budget. */
  const [testing, setTesting] = useState<Set<string>>(new Set());
  /** In-progress edits to a target's IP, keyed by target id. Kept apart from
   *  `lanes` so typing never triggers a PATCH per keystroke — the change is
   *  committed on blur/Enter. */
  const [ipDrafts, setIpDrafts] = useState<Map<string, string>>(new Map());
  /** Selected target for console display */
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  /** Sensor packets log per target */
  const [packetLogs, setPacketLogs] = useState<Map<string, SensorPacket[]>>(new Map());
  /** Targets currently armed (PLAY sent) */
  const [armedTargets, setArmedTargets] = useState<Set<string>>(new Set());

  const setIpDraft = (targetId: string, value: string) =>
    setIpDrafts((prev) => {
      const next = new Map(prev);
      if (value === "") next.delete(targetId);
      else next.set(targetId, value);
      return next;
    });

  /** In-progress edits to a target's command host/port override, keyed by
   *  target id. Only meaningful for simulated/container targets. */
  const [cmdDrafts, setCmdDrafts] = useState<Map<string, { host: string; port: string }>>(new Map());

  /** Rows with the command-override editor revealed. Defaults hidden so real
   *  targets (the overwhelming majority) show the compact IP cell only. */
  const [cmdOpen, setCmdOpen] = useState<Set<string>>(new Set());

  /** Rows with the sensitivity (wiper) panel expanded. Defaults hidden — every
   *  open/refresh is a live UDP round trip, not something to show by default
   *  for every target on the screen. */
  const [sensOpen, setSensOpen] = useState<Set<string>>(new Set());
  const toggleSens = (targetId: string) =>
    setSensOpen((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });

  const setCmdDraft = (target: Target, field: "host" | "port", value: string) =>
    setCmdDrafts((prev) => {
      const next = new Map(prev);
      const saved = {
        host: target.commandHost ?? "",
        port: target.commandPort ? String(target.commandPort) : "",
      };
      next.set(target.id, { ...(next.get(target.id) ?? saved), [field]: value });
      return next;
    });

  /** Log a sensor packet to the console for a target */
  const logPacket = (
    targetId: string,
    command: string,
    direction: "tx" | "rx",
    hex: string,
    ascii: string,
    status: "pending" | "success" | "error" | "info",
    description: string,
  ) => {
    setPacketLogs((prev) => {
      const logs = prev.get(targetId) ?? [];
      const newPacket: SensorPacket = {
        id: `${targetId}-${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        command,
        direction,
        hex,
        ascii,
        status,
        description,
      };
      const updated = [...logs, newPacket];
      // Keep only last 50 packets per target
      return new Map(prev).set(targetId, updated.slice(-50));
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.get<Lane[]>("/lanes");
      setLanes(
        (Array.isArray(rows) ? rows : []).sort((a, b) => a.id - b.id),
      );
    } catch (err) {
      triggerSuccessBanner(
        isAr
          ? "تعذّر تحميل الحارات"
          : `Could not load lanes${err instanceof ApiError ? `: ${err.message}` : ""}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : fallback;
    triggerSuccessBanner(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    // Whatever the client thought it had is now suspect — resync rather than
    // leaving a rejected change sitting on screen looking applied.
    void load();
  };

  const targetsOf = (lane: Lane) =>
    [...(lane.targets ?? [])].sort((a, b) => a.positionIndex - b.positionIndex);

  const mergeTarget = (laneId: number, saved: Target) =>
    setLanes((prev) =>
      prev.map((lane) =>
        lane.id !== laneId
          ? lane
          : {
              ...lane,
              targets: (lane.targets ?? []).some((t) => t.id === saved.id)
                ? (lane.targets ?? []).map((t) =>
                    t.id === saved.id ? saved : t,
                  )
                : [...(lane.targets ?? []), saved],
            },
      ),
    );

  // ── Targets ───────────────────────────────────────────────────────────────

  /**
   * Every field is a discrete choice now, so a row is valid the moment it is
   * changed and there is nothing left for a Save button to guard. Changes
   * commit on selection; a rejected one resyncs from the server.
   */
  const updateTarget = async (
    laneId: number,
    target: Target,
    patch: Partial<Pick<Target, "distanceM" | "positionIndex" | "profileType">>,
  ) => {
    const next = { ...target, ...patch };
    // Only a target ALREADY on the convention follows its slot to a new
    // address. One still on a legacy address is left alone: its board answers
    // where the router's reservation says it does, and quietly moving the
    // address because someone changed a distance would silently unbind it.
    // Use the readdress control for that, once the reservation has moved.
    const onConvention =
      target.ipAddress === addressFor(laneId, target.positionIndex);

    setBusyId(target.id);
    try {
      const saved = await api.patch<Target>(`/targets/${target.id}`, {
        distanceM: next.distanceM,
        positionIndex: next.positionIndex,
        profileType: next.profileType,
        // Derived, never asked for.
        label: labelFor(next.distanceM),
        ...(onConvention
          ? { ipAddress: addressFor(laneId, next.positionIndex) }
          : {}),
      });
      mergeTarget(laneId, saved);
    } catch (err) {
      fail(err, "Save failed");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Move a legacy address onto the convention, and nothing else.
   *
   * Separate from `updateTarget` because it is not a configuration change: the
   * board downrange only answers on its new address once the router's DHCP
   * reservation has been moved to match, so this is the operator saying "the
   * reservation is moved, catch up" — not something to do implicitly when they
   * happen to change a distance.
   */
  const readdressTarget = async (
    laneId: number,
    target: Target,
    ipAddress: string,
  ) => {
    setBusyId(target.id);
    try {
      const saved = await api.patch<Target>(`/targets/${target.id}`, {
        ipAddress,
      });
      mergeTarget(laneId, saved);
      triggerSuccessBanner(
        isAr ? `تم تحديث العنوان إلى ${ipAddress}` : `Address moved to ${ipAddress}`,
      );
    } catch (err) {
      fail(err, "Re-address failed");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Ask the board whether it is alive: the server sends PLAY, and the target
   * passes only if it echoes PLAY back — the same handshake a real stage arm
   * performs, so a green here means arming will actually work.
   *
   * Not routed through `fail()`: a board that does not answer is a RESULT, not
   * a request error, and reloading the lane list over it would be pointless
   * churn. Only a genuine transport/HTTP failure surfaces as an error.
   */
  /**
   * Commit a typed IP (or an explicit snap-back to the convention).
   *
   * Distinct from `readdressTarget` only in where the value comes from: an
   * arbitrary address is what makes a simulated/container target addressable
   * without being on the 10.0.1.x convention — the whole reason this field is
   * editable at all. Anything that is not a sane IPv4 is refused up front so a
   * typo cannot silently leave the target unreachable.
   */
  const commitIp = (target: Target, override?: string) => {
    const draft = ipDrafts.get(target.id);
    const next = (override ?? draft ?? "").trim();
    if (draft) setIpDraft(target.id, "");
    if (!next || next === target.ipAddress) return;

    const octets = next.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!octets || octets.slice(1).some((o) => Number(o) > 255)) {
      triggerSuccessBanner(isAr ? `عنوان غير صالح: ${next}` : `Invalid address: ${next}`);
      return;
    }
    void readdressTarget(target.laneId, target, next);
  };

  /**
   * Commit a command host/port override (Docker/simulated targets). Empty host
   * means "send commands to `ipAddress`"; empty port means the transport
   * default (14550). Only a real IPv4 host is accepted; a non-numeric port is
   * refused so a typo cannot silently send commands nowhere.
   */
  const commitCommand = (target: Target, field: "host" | "port") => {
    const draft = cmdDrafts.get(target.id);
    if (!draft) return;
    const rawHost = draft.host.trim();
    const rawPort = draft.port.trim();
    if (rawHost) {
      const octets = rawHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (!octets || octets.slice(1).some((o) => Number(o) > 255)) {
        triggerSuccessBanner(isAr ? `عنوان غير صالح: ${rawHost}` : `Invalid host: ${rawHost}`);
        setCmdDraft(target, field, "");
        return;
      }
    }
    if (rawPort) {
      const port = Number(rawPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        triggerSuccessBanner(isAr ? `منفذ غير صالح: ${rawPort}` : `Invalid port: ${rawPort}`);
        setCmdDraft(target, field, "");
        return;
      }
    }
    setCmdDrafts((prev) => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });

    const commandHost = rawHost || null;
    const commandPort = rawPort ? Number(rawPort) : null;
    if (commandHost === target.commandHost && commandPort === target.commandPort) return;

    setBusyId(target.id);
    api
      .patch<Target>(`/targets/${target.id}`, { commandHost, commandPort })
      .then((saved) => mergeTarget(target.laneId, saved))
      .catch((err) => fail(err, "Command address save failed"))
      .finally(() => setBusyId(null));
  };

  const runSelfTest = async (target: Target) => {
    setTesting((prev) => new Set(prev).add(target.id));
    try {
      const result = await api.post<TargetSelfTestResult>(
        `/targets/${target.id}/self-test`,
      );
      setTestResults((prev) => new Map(prev).set(target.id, result));
      // Real bytes from the 'T' round trip — null when the board never even
      // acknowledged PLAY, so the test frame was never sent.
      if (result.txHex) {
        logPacket(
          target.id,
          "T",
          "tx",
          result.txHex,
          hexToAscii(result.txHex),
          "info",
          `SELF-TEST → ${target.ipAddress}`,
        );
      }
      logPacket(
        target.id,
        "T",
        "rx",
        result.rxHex ?? "(no reply)",
        result.rxHex ? hexToAscii(result.rxHex) : "—",
        result.outcome === "PASSED" ? "success" : "error",
        result.message,
      );
      triggerSuccessBanner(
        isAr
          ? result.outcome === "PASSED"
            ? `${target.label} اجتاز الاختبار الذاتي ✓`
            : result.outcome === "FAILED"
              ? `${target.label} مسلَّح لكنه فشل الاختبار الذاتي.`
              : result.outcome === "NOT_ARMED"
                ? `${target.label} أفاد بأنه غير مسلَّح — أعد المحاولة.`
                : `${target.label} لا يستجيب — تحقّق من الطاقة والاتصال.`
          : result.message,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Self-test failed";
      logPacket(target.id, "T", "rx", "", "", "error", msg);
      triggerSuccessBanner(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    } finally {
      setTesting((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  /** Lowest slot not already mounted on this lane. */
  const freeSlot = (lane: Lane): number | null => {
    const used = new Set(targetsOf(lane).map((t) => t.positionIndex));
    for (let i = 0; i < MAX_SLOTS_PER_LANE; i += 1) {
      if (!used.has(i)) return i;
    }
    return null;
  };

  const addTarget = async (lane: Lane) => {
    const slot = freeSlot(lane);
    if (slot === null) {
      triggerSuccessBanner(
        isAr
          ? `الحد الأقصى ${MAX_SLOTS_PER_LANE} أهداف لكل حارة.`
          : `A lane holds at most ${MAX_SLOTS_PER_LANE} targets.`,
      );
      return;
    }
    if (lane.id > MAX_ADDRESSABLE_LANE) {
      triggerSuccessBanner(
        isAr
          ? `لا يمكن عنونة الحارة ${lane.id} على شبكة واحدة.`
          : `Lane ${lane.id} cannot be addressed on a single subnet (max ${MAX_ADDRESSABLE_LANE}).`,
      );
      return;
    }

    const distanceM = DISTANCE_PRESETS_M[0];
    // The very first board on a clean range is the real bench target — see
    // DEFAULT_TARGET_IP. Everything added after it follows the derived scheme.
    const firstTarget = lanes.every((l) => (l.targets ?? []).length === 0);
    const ipAddress = firstTarget ? DEFAULT_TARGET_IP : addressFor(lane.id, slot);
    setBusyId(`add-${lane.id}`);
    try {
      const saved = await api.post<Target>("/targets", {
        laneId: lane.id,
        label: labelFor(distanceM),
        distanceM,
        positionIndex: slot,
        ipAddress,
        profileType: "FIGURE" satisfies TargetProfileType,
      });
      mergeTarget(lane.id, saved);
      triggerSuccessBanner(
        isAr
          ? `تمت إضافة هدف في ${slotCode(lane.id, slot)} ✓`
          : `Target mounted at ${slotCode(lane.id, slot)} · ${ipAddress} ✓`,
      );
    } catch (err) {
      fail(err, "Failed to add target");
    } finally {
      setBusyId(null);
    }
  };

  const removeTarget = async (lane: Lane, target: Target) => {
    const ok = window.confirm(
      isAr
        ? `حذف الهدف ${slotCode(lane.id, target.positionIndex)}؟ ستُفقد معايرته.`
        : `Remove the target at ${slotCode(lane.id, target.positionIndex)} (${target.ipAddress})? Its calibration goes with it.`,
    );
    if (!ok) return;

    setBusyId(target.id);
    try {
      await api.delete(`/targets/${target.id}`);
      setLanes((prev) =>
        prev.map((l) =>
          l.id !== lane.id
            ? l
            : { ...l, targets: (l.targets ?? []).filter((t) => t.id !== target.id) },
        ),
      );
      triggerSuccessBanner(isAr ? "تم حذف الهدف" : "Target removed");
    } catch (err) {
      fail(err, "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  // ── Lanes ─────────────────────────────────────────────────────────────────

  const updateLane = async (lane: Lane, patch: Partial<Lane>) => {
    setBusyId(`lane-${lane.id}`);
    try {
      const saved = await api.patch<Lane>(`/lanes/${lane.id}`, patch);
      // PATCH /lanes returns the lane WITHOUT its targets — keep the ones
      // already loaded rather than blanking the row.
      setLanes((prev) =>
        prev.map((l) =>
          l.id === lane.id ? { ...saved, targets: l.targets } : l,
        ),
      );
    } catch (err) {
      fail(err, "Save failed");
    } finally {
      setBusyId(null);
    }
  };

  const addLane = async () => {
    const nextId = lanes.length ? Math.max(...lanes.map((l) => l.id)) + 1 : 1;
    try {
      await api.post<Lane>("/lanes", { name: `Lane ${nextId}`, siteName: "" });
      triggerSuccessBanner(isAr ? "تمت إضافة حارة ✓" : "Lane added ✓");
      await load();
    } catch (err) {
      fail(err, "Failed to add lane");
    }
  };

  /**
   * Deleting a lane cascades to its targets (schema: `onDelete: Cascade`) and
   * takes their calibration with them, so this confirms first. Sessions
   * reference the lane WITHOUT a cascade, so a lane that has ever been fired on
   * is refused by the server rather than silently taking history with it.
   */
  const removeLane = async (lane: Lane) => {
    const count = targetsOf(lane).length;
    const ok = window.confirm(
      isAr
        ? `حذف "${lane.name}" وجميع أهدافه (${count})؟ لا يمكن التراجع.`
        : `Delete "${lane.name}" and its ${count} commissioned target${count === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!ok) return;

    setBusyId(`lane-${lane.id}`);
    try {
      await api.delete(`/lanes/${lane.id}`);
      setLanes((prev) => prev.filter((l) => l.id !== lane.id));
      triggerSuccessBanner(
        isAr ? "تم حذف الحارة" : `Lane "${lane.name}" deleted`,
      );
    } catch (err) {
      fail(err, "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  // ── Sensor Control ────────────────────────────────────────────────────────

  const sendPlayCommand = async (target: Target) => {
    setSelectedTargetId(target.id);
    setBusyId(target.id);
    try {
      const result = await api.post<TargetPlayResult>(
        `/targets/${target.id}/play`,
      );
      const ok = result.armed;
      if (ok) setArmedTargets((prev) => new Set(prev).add(target.id));
      // Real bytes straight off the wire — tx is what the backend actually
      // sent, rx is what the board actually echoed.
      logPacket(
        target.id,
        "P",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `PLAY → ${target.ipAddress}`,
      );
      logPacket(
        target.id,
        "P",
        "rx",
        result.rxHex ?? "(no reply)",
        result.rxHex ? hexToAscii(result.rxHex) : "—",
        ok ? "success" : "error",
        result.message,
      );
      triggerSuccessBanner(
        ok
          ? isAr
            ? `${target.label} مسلَّح ✓`
            : `${target.label} armed ✓`
          : result.message,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Play failed";
      logPacket(target.id, "P", "rx", "", "", "error", msg);
      triggerSuccessBanner(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  const sendStopCommand = async (target: Target) => {
    setSelectedTargetId(target.id);
    setBusyId(target.id);
    try {
      const result = await api.post<TargetStopResult>(
        `/targets/${target.id}/stop`,
      );
      setArmedTargets((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      logPacket(
        target.id,
        "S",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `STOP → ${target.ipAddress}`,
      );
      logPacket(
        target.id,
        "S",
        "rx",
        result.rxHex ?? "(no reply)",
        result.rxHex ? hexToAscii(result.rxHex) : "—",
        result.ok ? "success" : "error",
        result.message,
      );
      triggerSuccessBanner(isAr ? `${target.label} تم الإيقاف` : result.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stop failed";
      logPacket(target.id, "S", "rx", "", "", "error", msg);
      triggerSuccessBanner(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  /** Ping the board ('H') and show the actual echo in the console. */
  const sendHeartbeat = async (target: Target) => {
    setSelectedTargetId(target.id);
    setBusyId(target.id);
    try {
      const result = await api.post<TargetHeartbeatResult>(
        `/targets/${target.id}/heartbeat`,
      );
      logPacket(
        target.id,
        "H",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `Heartbeat → ${target.ipAddress}`,
      );
      logPacket(
        target.id,
        "H",
        "rx",
        result.rxHex ?? "(no reply)",
        result.rxHex ? hexToAscii(result.rxHex) : "—",
        result.ok ? "success" : "error",
        result.message,
      );
      triggerSuccessBanner(
        result.ok
          ? isAr
            ? `${target.label} حيّ ✓`
            : `${target.label} alive ✓`
          : result.message,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Heartbeat failed";
      logPacket(target.id, "H", "rx", "", "", "error", msg);
      triggerSuccessBanner(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  /** 'D' — ask which of the board's 8 sensors detected a given shot. */
  const sendDevData = async (target: Target, shot: number) => {
    setSelectedTargetId(target.id);
    setBusyId(target.id);
    try {
      const result = await api.post<TargetDevDataResult>(
        `/targets/${target.id}/dev-data`,
        { shot },
      );
      logPacket(
        target.id,
        "D",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `Dev data shot #${shot} → ${target.ipAddress}`,
      );
      logPacket(
        target.id,
        "D",
        "rx",
        result.rxHex ?? "(no reply)",
        result.rxHex ? hexToAscii(result.rxHex) : "—",
        result.ok ? "success" : "error",
        result.message,
      );
      triggerSuccessBanner(result.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Dev data failed";
      logPacket(target.id, "D", "rx", "", "", "error", msg);
      triggerSuccessBanner(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  const clearConsole = (targetId: string) => {
    setPacketLogs((prev) => {
      const next = new Map(prev);
      next.delete(targetId);
      return next;
    });
  };

  const getSelectedTarget = (): Target | null => {
    if (!selectedTargetId) return null;
    for (const lane of lanes) {
      const target = (lane.targets ?? []).find((t) => t.id === selectedTargetId);
      if (target) return target;
    }
    return null;
  };

  // ── Presentation ──────────────────────────────────────────────────────────

  // Sized for a commissioning screen someone sits in front of and reads
  // addresses off, not for a dense live board — hence sm rather than the 2xs
  // used on the operations dashboard.
  const selectCls =
    "hud-form-input rounded px-2.5 py-2 admin-text-sm font-mono w-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const readonlyCellCls =
    "admin-text-sm font-mono px-2.5 py-2 rounded border truncate";
  const labelCls =
    "admin-text-xs font-mono hud-text-subtle uppercase tracking-wider mb-1 block";
  // Leading `auto` column is the target face — a visual anchor that makes a
  // wrong profile obvious while scanning, before anyone reads a word.
  const gridCls =
    "grid grid-cols-[auto_1fr] md:grid-cols-[auto_0.9fr_0.9fr_1.1fr_1.4fr_0.8fr_auto] gap-2 md:gap-3 items-center";

  return (
    <div className="flex h-full gap-0">
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="admin-text-lg font-semibold hud-text">
            {isAr ? "إدارة عتاد الحارات" : "Lane Hardware Management"}
          </h2>
          <p className="admin-text-xs hud-text-muted font-mono mt-0.5">
            {isAr
              ? "تهيئة الحارات والأهداف الفعلية المركّبة عليها"
              : "Commission lanes and the physical targets mounted on them"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => void addLane()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg admin-text-xs font-mono font-bold hud-btn-secondary cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3 shrink-0" />
              {isAr ? "إضافة حارة" : "Add Lane"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg admin-text-xs font-mono font-bold hud-btn-secondary cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3 h-3 shrink-0 ${loading ? "animate-spin" : ""}`}
            />
            {isAr ? "تحديث" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="admin-text-xs font-mono hud-text-subtle mb-3">
        {isAr
          ? `شبكة واحدة للميدان بالكامل (${RANGE_SUBNET}.x) — يُشتق العنوان من الحارة والموضع ولا يُكتب يدوياً.`
          : `One router, one subnet for the whole range (${RANGE_SUBNET}.x). Addresses are derived from lane and position — never typed.`}
      </p>

      {lanes.length === 0 && !loading && (
        <div className="px-3 py-6 rounded-lg border border-dashed border-hud text-center">
          <p className="admin-text-xs font-mono hud-text-subtle">
            {isAr
              ? "لا توجد حارات بعد. اطلب من المشرف الأعلى تهيئتها."
              : "No lanes yet. Ask a SUPER_ADMIN to commission the range."}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {lanes.map((lane) => {
          const rows = targetsOf(lane);
          const laneBusy = busyId === `lane-${lane.id}`;
          const addBusy = busyId === `add-${lane.id}`;
          const usedSlots = new Set(rows.map((t) => t.positionIndex));

          return (
            <div
              key={lane.id}
              className="rounded-lg border border-hud bg-hud-elevated p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-baseline gap-2.5 min-w-0">
                  <h3 className="admin-text-lg font-mono font-bold hud-text uppercase tracking-wider">
                    {isAr
                      ? `حارة ${lane.id}`
                      : `Lane ${String(lane.id).padStart(2, "0")}`}
                  </h3>
                  <span className="admin-text-xs font-mono hud-text-subtle truncate">
                    {lane.siteName || lane.name}
                    {" · "}
                    {rows.length}{" "}
                    {isAr ? "هدف" : `target${rows.length === 1 ? "" : "s"}`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                {readOnly ? (
                  <span
                    className={`${readonlyCellCls} w-auto uppercase tracking-wider font-bold ${
                      lane.status === "OCCUPIED"
                        ? "hud-accent"
                        : lane.status === "AVAILABLE"
                          ? "hud-success"
                          : lane.status === "MAINTENANCE"
                            ? "hud-warning"
                            : "hud-text-muted"
                    }`}
                  >
                    {laneStatusLabel(lane.status, isAr)}
                  </span>
                ) : (
                  <select
                    value={lane.status}
                    disabled={laneBusy}
                    onChange={(e) =>
                      void updateLane(lane, {
                        status: e.target.value as LaneStatus,
                      })
                    }
                    className={`${selectCls} w-auto uppercase tracking-wider font-bold`}
                  >
                    {/* Present but not offered — the session lifecycle owns it. */}
                    {lane.status === "OCCUPIED" && (
                      <option value="OCCUPIED">
                        {laneStatusLabel("OCCUPIED", isAr)}
                      </option>
                    )}
                    {SETTABLE_LANE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {laneStatusLabel(s, isAr)}
                      </option>
                    ))}
                  </select>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void removeLane(lane)}
                    disabled={laneBusy}
                    title={isAr ? "حذف الحارة" : "Delete lane"}
                    className="p-1.5 rounded text-rose-500 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    {laneBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </button>
                )}
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="admin-text-xs font-mono hud-text-subtle mb-2">
                  {isAr
                    ? "لا توجد أهداف على هذه الحارة."
                    : "No targets mounted on this lane."}
                </p>
              ) : (
                <div className="space-y-2 mb-2">
                  <div className={`hidden md:grid ${gridCls} px-1`}>
                    <span className={`${labelCls} w-12 text-center`}>
                      {isAr ? "الوجه" : "Face"}
                    </span>
                    <span className={labelCls}>{isAr ? "الاسم" : "Label"}</span>
                    <span className={labelCls}>
                      {isAr ? "المسافة" : "Distance"}
                    </span>
                    <span className={labelCls}>
                      {isAr ? "نوع الهدف" : "Profile"}
                    </span>
                    <span className={labelCls}>
                      {isAr ? "عنوان IP" : "IP Address"}
                    </span>
                    <span className={labelCls}>
                      {isAr ? "الموضع" : "Position"}
                    </span>
                    <span />
                  </div>

                  {rows.map((target) => {
                    const busy = busyId === target.id;
                    const expectedIp = addressFor(lane.id, target.positionIndex);
                    const test = testResults.get(target.id);
                    const isTesting = testing.has(target.id);
                    // Its own slot plus whatever is still free — offering a
                    // taken slot would collide on both @@unique([laneId,
                    // positionIndex]) and the target's unique address.
                    const slotOptions = Array.from(
                      { length: MAX_SLOTS_PER_LANE },
                      (_v, i) => i,
                    ).filter(
                      (i) => i === target.positionIndex || !usedSlots.has(i),
                    );

                    const testStatus: "testing" | "pass" | "fail" | "not-armed" | "no-answer" | "idle" =
                      isTesting
                        ? "testing"
                        : test?.outcome === "PASSED"
                          ? "pass"
                          : test?.outcome === "FAILED"
                            ? "fail"
                            : test?.outcome === "NOT_ARMED"
                              ? "not-armed"
                              : test
                                ? "no-answer"
                                : "idle";

                    return (
                      // Outer wrapper is intentionally NOT the grid — the
                      // command-override editor and the sensitivity panel
                      // below render at full row width as block-level
                      // siblings, not as additional grid cells. Interleaving
                      // them as extra children of a 7-column grid (as an
                      // earlier version of this did for the cmd editor) makes
                      // every cell after them wrap into the wrong column of an
                      // implicit next row.
                      <div
                        key={target.id}
                        className={`space-y-1.5 cursor-pointer rounded p-2 transition-colors ${
                          selectedTargetId === target.id
                            ? "bg-hud-accent/10 border border-hud-accent/30"
                            : "hover:bg-hud/50"
                        }`}
                        onClick={() => setSelectedTargetId(target.id)}
                      >
                      <div className={gridCls}>
                        <TargetFacePreview
                          profileType={target.profileType}
                          size={48}
                          title={`${slotCode(lane.id, target.positionIndex)} · ${target.distanceM}m`}
                          className="hud-text-muted"
                        />

                        {/* Derived from the distance below — a target's name IS
                            where it stands, so there is nothing to type. */}
                        <span
                          className={`${readonlyCellCls} hud-text border-hud/40`}
                          title={isAr ? "يُشتق من المسافة" : "Derived from distance"}
                        >
                          {target.label}
                        </span>

                        {readOnly ? (
                          <span className={`${readonlyCellCls} hud-text border-hud/40`}>
                            {target.distanceM}m
                          </span>
                        ) : (
                          <select
                            value={target.distanceM}
                            disabled={busy}
                            onChange={(e) =>
                              void updateTarget(lane.id, target, {
                                distanceM: Number(e.target.value),
                              })
                            }
                            className={selectCls}
                          >
                            {/* A distance already in the database that is not a
                                preset stays selectable, so an older commissioning
                                is not silently rewritten by opening this screen. */}
                            {!DISTANCE_PRESETS_M.includes(
                              target.distanceM as (typeof DISTANCE_PRESETS_M)[number],
                            ) && (
                              <option value={target.distanceM}>
                                {target.distanceM}m
                              </option>
                            )}
                            {DISTANCE_PRESETS_M.map((d) => (
                              <option key={d} value={d}>
                                {d}m
                              </option>
                            ))}
                          </select>
                        )}

                        {readOnly ? (
                          <span className={`${readonlyCellCls} hud-text border-hud/40`}>
                            {target.profileType === "FIGURE"
                              ? isAr
                                ? "شخصي"
                                : "Silhouette"
                              : isAr
                                ? "دائري"
                                : "Bullseye"}
                          </span>
                        ) : (
                          <select
                            value={target.profileType}
                            disabled={busy}
                            onChange={(e) =>
                              void updateTarget(lane.id, target, {
                                profileType: e.target.value as TargetProfileType,
                              })
                            }
                            className={selectCls}
                          >
                            {PROFILES.map((p) => (
                              <option key={p} value={p}>
                                {p === "FIGURE"
                                  ? isAr
                                    ? "شخصي"
                                    : "Silhouette"
                                  : isAr
                                    ? "دائري"
                                    : "Bullseye"}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Editable for SUPER_ADMIN: an address is usually a
                            consequence of lane + position, but a target is not
                            always on the convention — a simulated or container
                            target answers on whatever IP its network gives it,
                            and that has to be typed in. Committed on
                            blur/Enter; off-convention targets also get a snap
                            back to the derived address. */}
                        {readOnly ? (
                          expectedIp === target.ipAddress ? (
                            <span
                              className={`${readonlyCellCls} hud-accent border-hud/40`}
                              title={
                                isAr
                                  ? "يُشتق من الحارة والموضع"
                                  : `Derived: lane ${lane.id}, slot ${target.positionIndex + 1}`
                              }
                            >
                              {target.ipAddress}
                            </span>
                          ) : (
                            <span
                              className={`${readonlyCellCls} text-amber-500 border-amber-500/40`}
                              title={
                                isAr
                                  ? `خارج الاتفاقية. المتوقع ${expectedIp}`
                                  : `Off-convention. Expected ${expectedIp}`
                              }
                            >
                              {target.ipAddress} → {expectedIp}
                            </span>
                          )
                        ) : (
                          <div
                            className={`${readonlyCellCls} flex items-center gap-1 border-hud/40 p-1`}
                          >
                            <input
                              type="text"
                              value={ipDrafts.get(target.id) ?? target.ipAddress}
                              disabled={busy}
                              onChange={(e) => setIpDraft(target.id, e.target.value)}
                              onBlur={() => commitIp(target)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === "Escape") {
                                  setIpDraft(target.id, "");
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-full min-w-0 bg-transparent font-mono admin-text-sm px-1.5 py-0.5 rounded border border-transparent hover:border-hud focus:border-[var(--hud-accent-border)] focus:bg-[var(--hud-elevated)] outline-none transition-colors disabled:opacity-50"
                              title={
                                isAr
                                  ? "عنوان IP الهدف — يُحفظ عند الخروج من الحقل"
                                  : "Target IP — saved on blur/Enter"
                              }
                            />
                            {target.ipAddress !== expectedIp && (
                              <button
                                type="button"
                                onClick={() => commitIp(target, expectedIp)}
                                disabled={busy}
                                title={
                                  isAr
                                    ? `العودة إلى العنوان المشتق (${expectedIp})`
                                    : `Snap to derived address (${expectedIp})`
                                }
                                className="shrink-0 p-1 rounded text-amber-500 hover:bg-amber-500/10 cursor-pointer disabled:opacity-50 transition-colors"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}

                        {readOnly ? (
                          <span className={`${readonlyCellCls} hud-text border-hud/40`}>
                            {slotCode(lane.id, target.positionIndex)}
                          </span>
                        ) : (
                          <select
                            value={target.positionIndex}
                            disabled={busy}
                            onChange={(e) =>
                              void updateTarget(lane.id, target, {
                                positionIndex: Number(e.target.value),
                              })
                            }
                            className={selectCls}
                          >
                            {slotOptions.map((i) => (
                              <option key={i} value={i}>
                                {slotCode(lane.id, i)}
                              </option>
                            ))}
                          </select>
                        )}

                        {!readOnly && (
                          <div className="flex items-center justify-end gap-1.5 shrink-0">
                          {/* PLAY/STOP live in the sensor console for the
                              selected target — the row used to carry its own
                              copies, which duplicated the console's. */}
                          {/* Green only after the board has actually run and
                              PASSED its own self-test ('T'). Never green from
                              configuration alone — a row can be perfectly
                              filled in and point at a board that is unplugged,
                              or one that is reachable but whose timing circuit
                              has actually failed. */}
                          <button
                            type="button"
                            onClick={() => void runSelfTest(target)}
                            disabled={isTesting}
                            title={
                              test
                                ? test.message
                                : isAr
                                  ? "تشغيل الهدف وتنفيذ اختبار ذاتي، ثم إيقافه"
                                  : "Arm the target, run its self-test, then disarm it"
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded admin-text-xs font-mono font-bold cursor-pointer transition-colors disabled:cursor-wait ${
                              testStatus === "testing"
                                ? "border border-hud hud-text-subtle"
                                : testStatus === "pass"
                                  ? "border border-emerald-500/50 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"
                                  : testStatus === "fail"
                                    ? "border border-rose-500/50 text-rose-500 bg-rose-500/10 hover:bg-rose-500/20"
                                    : testStatus === "not-armed"
                                      ? "border border-amber-500/50 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20"
                                      : testStatus === "no-answer"
                                        ? "border border-rose-500/50 text-rose-500 bg-rose-500/10 hover:bg-rose-500/20"
                                        : "hud-btn-secondary"
                            }`}
                          >
                            {testStatus === "testing" ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {isAr ? "جارٍ" : "Testing"}
                              </>
                            ) : testStatus === "pass" ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {isAr ? "ناجح" : "Passed"}
                              </>
                            ) : testStatus === "fail" ? (
                              <>
                                <AlertCircle className="w-3.5 h-3.5" />
                                {isAr ? "فشل الاختبار" : "Failed"}
                              </>
                            ) : testStatus === "not-armed" ? (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {isAr ? "غير مسلَّح" : "Not armed"}
                              </>
                            ) : testStatus === "no-answer" ? (
                              <>
                                <AlertCircle className="w-3.5 h-3.5" />
                                {isAr ? "لا يستجيب" : "No reply"}
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                {isAr ? "اختبار" : "Test"}
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSens(target.id)}
                            title={
                              isAr
                                ? "الحساسية (مواضع المقاومات)"
                                : "Sensitivity (wiper positions)"
                            }
                            className={`p-1.5 rounded cursor-pointer transition-colors ${
                              sensOpen.has(target.id)
                                ? "hud-accent bg-[var(--hud-accent-bg-subtle)]"
                                : "hud-text-subtle hover:bg-hud-elevated"
                            }`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeTarget(lane, target)}
                            disabled={busy}
                            title={isAr ? "حذف" : "Remove"}
                            className="p-1.5 rounded text-rose-500 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50 transition-colors"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        )}
                      </div>

                      {/* Command unicast override — Docker/simulated targets
                          only. Full row width, block-level: see the comment
                          on the outer wrapper for why this is not a grid cell. */}
                      {!readOnly && (cmdOpen.has(target.id) || target.commandHost || target.commandPort) && (
                        <div className="flex items-center gap-1 admin-text-2xs hud-text-subtle">
                          <span className="font-mono" title={isAr ? "عنوان الأوامر" : "Command host/port (PLAY/STOP)"}>
                            cmd
                          </span>
                          <input
                            type="text"
                            value={
                              cmdDrafts.get(target.id)?.host ??
                              target.commandHost ??
                              ""
                            }
                            disabled={busy}
                            placeholder={isAr ? "= IP" : "= IP"}
                            onChange={(e) => setCmdDraft(target, "host", e.target.value)}
                            onBlur={() => commitCommand(target, "host")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              } else if (e.key === "Escape") {
                                setCmdDrafts((prev) => {
                                  const next = new Map(prev);
                                  next.delete(target.id);
                                  return next;
                                });
                                setCmdOpen((prev) => {
                                  const next = new Set(prev);
                                  next.delete(target.id);
                                  return next;
                                });
                              }
                            }}
                            className="w-24 min-w-0 bg-transparent font-mono px-1 py-0.5 rounded border border-hud/40 hover:border-hud focus:border-[var(--hud-accent-border)] focus:bg-[var(--hud-elevated)] outline-none transition-colors disabled:opacity-50"
                            title={isAr ? "مضيف الأوامر — فارغ يعني عنوان IP" : "Command host — empty means the target IP"}
                          />
                          <span>:</span>
                          <input
                            type="text"
                            value={
                              cmdDrafts.get(target.id)?.port ??
                              (target.commandPort ? String(target.commandPort) : "")
                            }
                            disabled={busy}
                            placeholder="14550"
                            onChange={(e) => setCmdDraft(target, "port", e.target.value)}
                            onBlur={() => commitCommand(target, "port")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              } else if (e.key === "Escape") {
                                setCmdDrafts((prev) => {
                                  const next = new Map(prev);
                                  next.delete(target.id);
                                  return next;
                                });
                                setCmdOpen((prev) => {
                                  const next = new Set(prev);
                                  next.delete(target.id);
                                  return next;
                                });
                              }
                            }}
                            className="w-16 min-w-0 bg-transparent font-mono px-1 py-0.5 rounded border border-hud/40 hover:border-hud focus:border-[var(--hud-accent-border)] focus:bg-[var(--hud-elevated)] outline-none transition-colors disabled:opacity-50"
                            title={isAr ? "منفذ الأوامر — فارغ يعني 14550" : "Command port — empty means 14550"}
                          />
                          {!target.commandHost && !target.commandPort && (
                            <button
                              type="button"
                              onClick={() => setCmdOpen((prev) => new Set([...prev].filter((id) => id !== target.id)))}
                              disabled={busy}
                              title={isAr ? "إخفاء" : "Hide"}
                              className="shrink-0 p-0.5 rounded hud-text-subtle hover:bg-hud-elevated cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {!readOnly && !cmdOpen.has(target.id) && !target.commandHost && !target.commandPort && (
                        <button
                          type="button"
                          onClick={() => setCmdOpen((prev) => new Set(prev).add(target.id))}
                          disabled={busy}
                          title={isAr ? "تجاوز عنوان الأوامر (أهداف المحاكاة)" : "Command address override (simulated targets)"}
                          className="admin-text-2xs font-mono hud-text-subtle hover:text-[var(--hud-accent)] hover:bg-[var(--hud-accent-bg)] px-1 py-0.5 rounded transition-colors disabled:opacity-50"
                        >
                          +cmd
                        </button>
                      )}

                      {/* Sensitivity — SUPER_ADMIN only, live off the board.
                          See TargetSensitivityPanel for why channels are
                          A1..A5/B1..B5 and never a physical sensor name. */}
                      {!readOnly && sensOpen.has(target.id) && (
                        <TargetSensitivityPanel
                          target={target}
                          isAr={isAr}
                          onNotice={triggerSuccessBanner}
                        />
                      )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => void addTarget(lane)}
                  disabled={addBusy || rows.length >= MAX_SLOTS_PER_LANE}
                  className="inline-flex items-center gap-1.5 admin-text-xs font-mono hud-accent cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  {addBusy ? (
                    <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                  ) : (
                    <Crosshair className="w-3 h-3 shrink-0" />
                  )}
                  {isAr ? "إضافة هدف لهذه الحارة" : "Add target to this lane"}
                  {rows.length < MAX_SLOTS_PER_LANE && (
                    <span className="hud-text-subtle">
                      {" — "}
                      {slotCode(lane.id, freeSlot(lane) ?? 0)} ·{" "}
                      {lanes.every((l) => (l.targets ?? []).length === 0)
                        ? DEFAULT_TARGET_IP
                        : addressFor(lane.id, freeSlot(lane) ?? 0)}
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
      </div>

      <TargetSensorConsole
        target={getSelectedTarget()}
        isAr={isAr}
        packets={packetLogs.get(selectedTargetId ?? "") ?? []}
        isConnected={true}
        isArmed={selectedTargetId ? armedTargets.has(selectedTargetId) : false}
        isTesting={selectedTargetId ? testing.has(selectedTargetId) : false}
        mode={mode}
        onClear={() => selectedTargetId && clearConsole(selectedTargetId)}
        onPlay={() => getSelectedTarget() && sendPlayCommand(getSelectedTarget()!)}
        onStop={() => getSelectedTarget() && sendStopCommand(getSelectedTarget()!)}
        onHeartbeat={() => getSelectedTarget() && sendHeartbeat(getSelectedTarget()!)}
        onSelfTest={() => getSelectedTarget() && runSelfTest(getSelectedTarget()!)}
        onDevData={(shot) => getSelectedTarget() && sendDevData(getSelectedTarget()!, shot)}
      />
    </div>
  );
}
