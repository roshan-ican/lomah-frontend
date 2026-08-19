import { useEffect, useState } from "react";
import { RefreshCw, Laptop, Monitor, Unlink } from "lucide-react";
import { api, ApiError } from "../../../../utils/api";
import type { ConnectedShooter, Lane } from "../../../../types";

interface Props {
  isAr: boolean;
  triggerSuccessBanner: (msg: string) => void;
  /** Failures. Rendered red with a warning icon — routing them through
   *  triggerSuccessBanner produced a green checkmark on the word "Error". */
  triggerErrorBanner: (msg: string) => void;
}

/**
 * Which tablet is standing at which lane. Day-to-day range operation, which is
 * why it lives on the ADMIN console and not the commissioning one: moving a
 * shooter from lane 3 to lane 7 happens between relays, constantly, and has
 * nothing to do with what hardware exists.
 *
 * Assignment is DEVICE-first. Shooters have no accounts to log into, so "who is
 * here" is exactly "which devices are talking to us" — the admin picks a machine
 * that demonstrably exists rather than typing an address they would have to go
 * read off the back of a tablet.
 */
export function LaneAssignmentPanel({ isAr, triggerSuccessBanner, triggerErrorBanner }: Props) {
  const [devices, setDevices] = useState<ConnectedShooter[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [loading, setLoading] = useState(false);
  /** Device key mid-request, so one row spins rather than the whole panel. */
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadDevices = async () => {
    try {
      const rows = await api.get<ConnectedShooter[]>("/auth/connected-shooters");
      setDevices(Array.isArray(rows) ? rows : []);
    } catch {
      /* polled list — a blip must not blank the panel */
    }
  };

  const loadLanes = async () => {
    setLoading(true);
    try {
      const rows = await api.get<Lane[]>("/lanes");
      // The real lanes, not a hardcoded count: a range with 6 lanes must not
      // offer 10, and a lane a SUPER_ADMIN added must show up here without a
      // code change.
      setLanes((Array.isArray(rows) ? rows : []).sort((a, b) => a.id - b.id));
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
    void loadLanes();
    void loadDevices();
    const interval = setInterval(loadDevices, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Assign, move or release a device.
   *
   * Addressed by the device's KEY — its deviceId when the tablet sent one, else
   * its IP. Not by IP unconditionally: a tablet that reports a deviceId is
   * tracked under that id, so an IP-keyed assign silently misses it, and a
   * tablet that picks up a new lease would be treated as a different machine.
   */
  const assign = async (device: ConnectedShooter, laneId: number | null) => {
    setBusyKey(device.key);
    try {
      await api.post("/auth/connected-shooters/assign", {
        deviceKey: device.key,
        laneId,
      });
      // Reflect it immediately; the 5s poll confirms.
      setDevices((prev) =>
        prev.map((d) => (d.key === device.key ? { ...d, laneId } : d)),
      );
      triggerSuccessBanner(
        laneId === null
          ? isAr
            ? `تم إلغاء ربط ${device.ip}`
            : `${device.ip} released`
          : isAr
            ? `تم تعيين ${device.ip} للحارة ${laneId} ✓`
            : `${device.ip} → lane ${laneId} ✓`,
      );
      await loadDevices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assign device";
      triggerErrorBanner(msg);
      await loadDevices();
    } finally {
      setBusyKey(null);
    }
  };

  // `device.laneId` is the assignment — it is what the server stores and what
  // the shooter app reads back. Nothing else needs consulting.
  const deviceOnLane = (laneId: number) =>
    devices.find((d) => d.laneId === laneId);
  const unassigned = devices.filter((d) => d.laneId == null);

  const selectCls =
    "hud-form-input rounded px-2 py-1 admin-text-2xs font-mono shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="admin-text-lg font-semibold hud-text">
            {isAr ? "توزيع الرماة على الحارات" : "Lane Assignment"}
          </h2>
          <p className="admin-text-2xs hud-text-muted font-mono mt-0.5">
            {isAr
              ? "انقل أجهزة الرماة بين الحارات بين الجولات"
              : "Move shooter devices between lanes as relays change"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadLanes();
            void loadDevices();
          }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg admin-text-2xs font-mono font-bold hud-btn-secondary cursor-pointer transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3 h-3 shrink-0 ${loading ? "animate-spin" : ""}`}
          />
          {isAr ? "تحديث" : "Refresh"}
        </button>
      </div>

      {/* ── Connected devices ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="admin-text-base font-mono font-bold hud-text uppercase tracking-wider">
            {isAr ? "الأجهزة المتصلة" : "Connected Devices"}
          </h3>
          <span className="admin-text-2xs font-mono hud-text-subtle">
            {devices.length}
          </span>
          {unassigned.length > 0 && (
            <span className="px-1.5 py-0.5 rounded admin-text-2xs font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20">
              {unassigned.length} {isAr ? "بلا حارة" : "unassigned"}
            </span>
          )}
        </div>

        {devices.length === 0 ? (
          <div className="px-3 py-4 rounded-lg border border-dashed border-hud text-center">
            <p className="admin-text-2xs font-mono hud-text-subtle">
              {isAr
                ? "لا توجد أجهزة متصلة. افتح تطبيق الرامي على الجهاز وسيظهر هنا."
                : "No devices connected. Open the shooter app on a device and it will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {devices.map((device) => {
              const busy = busyKey === device.key;
              return (
                <div
                  key={device.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 bg-hud-elevated rounded-lg border border-hud"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        device.laneId != null
                          ? "bg-[var(--hud-accent-bg-subtle)] hud-accent"
                          : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                      }`}
                    >
                      <Laptop className="w-3 h-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="admin-text-base font-mono hud-text truncate">
                        {device.ip}
                        {device.deviceId && (
                          <span
                            className="hud-text-subtle ms-2"
                            title={isAr ? "معرّف الجهاز" : "Device id"}
                          >
                            {device.deviceId}
                          </span>
                        )}
                      </p>
                      <p className="admin-text-2xs font-mono hud-text-subtle">
                        {device.laneId != null
                          ? isAr
                            ? `معيَّن للحارة ${device.laneId}`
                            : `Assigned to lane ${device.laneId}`
                          : isAr
                            ? "بانتظار التعيين"
                            : "Awaiting assignment"}
                      </p>
                    </div>
                  </div>

                  <select
                    value={device.laneId ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      void assign(
                        device,
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    className={selectCls}
                  >
                    <option value="">
                      {isAr ? "— غير معيَّن —" : "— Unassigned —"}
                    </option>
                    {lanes.map((lane) => {
                      // An occupied lane cannot be taken by another tablet
                      // accidentally. The current holder keeps its own option
                      // enabled; release it first when a deliberate swap is
                      // needed.
                      const holder = deviceOnLane(lane.id);
                      const takenByOther =
                        !!holder && holder.key !== device.key;
                      return (
                        <option
                          key={lane.id}
                          value={lane.id}
                          disabled={takenByOther}
                        >
                          {isAr ? `حارة ${lane.id}` : `Lane ${lane.id}`}
                          {takenByOther ? (isAr ? " (مشغولة)" : " (in use)") : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── The same picture by lane ──────────────────────────────────────── */}
      <h3 className="admin-text-base font-mono font-bold hud-text uppercase tracking-wider mb-2">
        {isAr ? "حسب الحارة" : "By Lane"}
      </h3>
      {lanes.length === 0 ? (
        <p className="admin-text-2xs font-mono hud-text-subtle px-3 py-4 rounded-lg border border-dashed border-hud text-center">
          {isAr
            ? "لا توجد حارات مهيّأة. يقوم المشرف الأعلى بتهيئتها."
            : "No lanes commissioned yet. A super admin sets those up."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {lanes.map((lane) => {
            const device = deviceOnLane(lane.id);
            const busy = !!device && busyKey === device.key;
            return (
              <div
                key={lane.id}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-hud-elevated rounded-lg border border-hud"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      device
                        ? "bg-[var(--hud-accent-bg-subtle)] hud-accent"
                        : "bg-hud-elevated hud-text-subtle border border-hud"
                    }`}
                  >
                    <Monitor className="w-3 h-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="admin-text-base font-mono font-bold hud-text">
                      {isAr ? `حارة ${lane.id}` : `Lane ${lane.id}`}
                      <span className="hud-text-subtle font-normal ms-2">
                        {lane.siteName || lane.name}
                      </span>
                    </p>
                    <p
                      className={`admin-text-2xs font-mono truncate ${
                        device ? "hud-text-muted" : "hud-text-subtle italic"
                      }`}
                    >
                      {device
                        ? device.ip
                        : isAr
                          ? "لا يوجد جهاز"
                          : "No device"}
                    </p>
                  </div>
                </div>
                {device && (
                  <button
                    type="button"
                    onClick={() => void assign(device, null)}
                    disabled={busy}
                    title={isAr ? "إلغاء الربط" : "Release device"}
                    className="p-1.5 rounded hover:bg-rose-500/10 cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Unlink className="w-3.5 h-3.5 hud-text-muted hover:text-rose-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
