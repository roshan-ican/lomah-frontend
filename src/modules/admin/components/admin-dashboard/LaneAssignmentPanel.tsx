import { useEffect, useState } from "react";
import { Laptop, Monitor, Unlink, Wifi } from "lucide-react";
import { PageHeader, EmptyState } from "./PageHeader";
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
export function LaneAssignmentPanel({
  isAr,
  triggerSuccessBanner,
  triggerErrorBanner,
}: Props) {
  const [devices, setDevices] = useState<ConnectedShooter[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [loading, setLoading] = useState(false);
  /** Device key mid-request, so one row spins rather than the whole panel. */
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadDevices = async () => {
    try {
      const rows = await api.get<ConnectedShooter[]>(
        "/auth/connected-shooters",
      );
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
      triggerErrorBanner(
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
      const msg =
        err instanceof Error ? err.message : "Failed to assign device";
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

  const laneLabel = (id: number) => (isAr ? `حارة ${id}` : `Lane ${id}`);

  return (
    <section className="space-y-5 pb-8">
      <PageHeader
        eyebrow={isAr ? "أجهزة الرماة" : "Shooter devices"}
        title={isAr ? "توزيع الحارات" : "Lane Assignment"}
        subtitle={
          isAr ? "اختر حارة لكل جهاز متصل." : "Pick a lane for each connected device."
        }
        isAr={isAr}
        loading={loading}
        onRefresh={() => {
          void loadLanes();
          void loadDevices();
        }}
      />

      <div className="hud-glass rounded-3xl p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 hud-accent" />
            <p className="admin-text-2xs font-semibold uppercase tracking-[0.14em] hud-text-muted">
              {isAr ? "المتصلة" : "Connected"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-hud-elevated px-3 py-1.5 admin-text-2xs font-semibold hud-text-muted tabular-nums">
              {devices.length}
            </span>
            {unassigned.length > 0 && (
              <span className="rounded-full bg-amber-500/10 text-amber-500 px-3 py-1.5 admin-text-2xs font-semibold">
                {unassigned.length} {isAr ? "بلا حارة" : "unassigned"}
              </span>
            )}
          </div>
        </div>

        {devices.length === 0 ? (
          <EmptyState
            icon={<Laptop className="w-9 h-9" />}
            title={isAr ? "لا توجد أجهزة" : "No devices"}
            hint={isAr ? "افتح تطبيق الرامي على الجهاز." : "Open the shooter app on a device."}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {devices.map((device) => {
              const busy = busyKey === device.key;
              const assigned = device.laneId != null;
              return (
                <div
                  key={device.key}
                  className={`rounded-2xl px-3.5 py-3 border transition-colors ${
                    assigned ? "border-hud" : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${
                        assigned
                          ? "bg-[var(--hud-accent)] text-black"
                          : "bg-amber-500/15 text-amber-500"
                      }`}
                    >
                      <Laptop className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="admin-text-sm font-semibold hud-text font-mono truncate">
                        {device.ip}
                      </p>
                      {device.deviceId && (
                        <p className="admin-text-2xs font-mono hud-text-subtle truncate">
                          {device.deviceId}
                        </p>
                      )}
                    </div>
                  </div>
                  <select
                    value={device.laneId ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      void assign(device, e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="hud-form-input mt-3 w-full rounded-xl px-3 py-2 admin-text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                  >
                    <option value="">{isAr ? "بلا حارة" : "No lane"}</option>
                    {lanes.map((lane) => {
                      const holder = deviceOnLane(lane.id);
                      const takenByOther = !!holder && holder.key !== device.key;
                      return (
                        <option key={lane.id} value={lane.id} disabled={takenByOther}>
                          {laneLabel(lane.id)}
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

      <div className="hud-glass rounded-3xl p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Monitor className="w-4 h-4 hud-accent" />
          <p className="admin-text-2xs font-semibold uppercase tracking-[0.14em] hud-text-muted">
            {isAr ? "الحارات" : "Lanes"}
          </p>
        </div>
        {lanes.length === 0 ? (
          <EmptyState
            icon={<Monitor className="w-9 h-9" />}
            title={isAr ? "لا توجد حارات" : "No lanes yet"}
            hint={isAr ? "أضفها من الحارات والأهداف." : "Add them in Lanes & Targets."}
          />
        ) : (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            {lanes.map((lane) => {
              const device = deviceOnLane(lane.id);
              const busy = !!device && busyKey === device.key;
              return (
                <div
                  key={lane.id}
                  className={`rounded-2xl px-3.5 py-3 border ${
                    device
                      ? "border-[var(--hud-accent-border)] bg-[var(--hud-accent-bg-subtle)]"
                      : "border-hud"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="admin-text-sm font-bold hud-text tabular-nums">
                      {laneLabel(lane.id)}
                    </span>
                    {device && (
                      <button
                        type="button"
                        onClick={() => void assign(device, null)}
                        disabled={busy}
                        title={isAr ? "إلغاء الربط" : "Release device"}
                        className="p-1.5 -m-1 rounded-lg hud-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50 active:scale-[0.94]"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p
                    className={`admin-text-2xs mt-1 truncate ${
                      device ? "font-mono hud-accent" : "hud-text-subtle"
                    }`}
                  >
                    {device ? device.ip : isAr ? "فارغة" : "Empty"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
