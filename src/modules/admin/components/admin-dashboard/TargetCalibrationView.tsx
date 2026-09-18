import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Crosshair,
  Loader2,
  MapPinned,
  RefreshCw,
  Ruler,
  Target as TargetIcon,
  Wifi,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api, ApiError } from "../../../../utils/api";
import type { Lane, Target } from "../../../../types";
import { TargetCalibrationPanel } from "./TargetCalibrationPanel";

interface Props {
  isAr: boolean;
  triggerSuccessBanner: (msg: string) => void;
  triggerErrorBanner: (msg: string) => void;
  addAdminLog?: (msg: string) => void;
}

export function TargetCalibrationView({
  isAr,
  triggerSuccessBanner,
  triggerErrorBanner,
  addAdminLog,
}: Props) {
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<number | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reduceMotion = useReducedMotion();
  const selectionTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, bounce: 0, duration: 0.35 };

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.get<Lane[]>("/lanes");
      const next = (Array.isArray(rows) ? rows : []).sort(
        (a, b) => a.id - b.id,
      );
      setLanes(next);
      setSelectedLaneId((current) => {
        if (
          current &&
          next.some(
            (lane) => lane.id === current && (lane.targets?.length ?? 0) > 0,
          )
        )
          return current;
        return next.find((lane) => (lane.targets?.length ?? 0) > 0)?.id ?? null;
      });
      setSelectedTargetId((current) => {
        if (
          current &&
          next.some((lane) =>
            lane.targets?.some((target) => target.id === current),
          )
        )
          return current;
        return next.flatMap((lane) => lane.targets ?? [])[0]?.id ?? null;
      });
    } catch (err) {
      triggerErrorBanner(
        isAr
          ? "تعذّر تحميل الأهداف"
          : `Could not load targets${err instanceof ApiError ? `: ${err.message}` : ""}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetRows = useMemo(
    () =>
      lanes.flatMap((lane) =>
        [...(lane.targets ?? [])]
          .sort((a, b) => a.positionIndex - b.positionIndex)
          .map((target) => ({ lane, target })),
      ),
    [lanes],
  );
  const selected = targetRows.find(
    ({ target }) => target.id === selectedTargetId,
  );
  const selectedLane = lanes.find((lane) => lane.id === selectedLaneId);
  const laneTargets = [...(selectedLane?.targets ?? [])].sort(
    (a, b) => a.positionIndex - b.positionIndex,
  );
  const siblings = selected
    ? (selected.lane.targets ?? []).filter(
        (target) => target.id !== selected.target.id,
      )
    : [];

  const mergeTarget = (saved: Target) => {
    setLanes((current) =>
      current.map((lane) =>
        lane.id !== saved.laneId
          ? lane
          : {
              ...lane,
              targets: (lane.targets ?? []).map((target) =>
                target.id === saved.id ? saved : target,
              ),
            },
      ),
    );
  };

  const selectLane = (lane: Lane) => {
    const targets = [...(lane.targets ?? [])].sort(
      (a, b) => a.positionIndex - b.positionIndex,
    );
    setSelectedLaneId(lane.id);
    setSelectedTargetId(targets[0]?.id ?? null);
  };

  if (loading && targetRows.length === 0) {
    return (
      <div className="min-h-72 grid place-items-center rounded-3xl border border-hud hud-glass">
        <Loader2 className="w-6 h-6 animate-spin hud-accent" />
      </div>
    );
  }

  return (
    <section className="min-h-full space-y-5 pb-8">
      <header className="flex items-end justify-between gap-4 flex-wrap px-1">
        <div>
          <p className="admin-text-2xs font-semibold uppercase tracking-[0.16em] hud-accent">
            {isAr ? "تشغيل العتاد" : "Hardware commissioning"}
          </p>
          <h1 className="text-[clamp(1.6rem,3vw,2.25rem)] leading-[1.08] tracking-[-0.025em] font-bold hud-text mt-1.5">
            {isAr ? "معايرة الأهداف" : "Target Calibration"}
          </h1>
          <p className="admin-text-sm leading-relaxed hud-text-muted mt-2 max-w-2xl">
            {isAr
              ? "اختر حارة وهدفاً، ثم طابق قراءة اللوحة مع موضع الإصابة الحقيقي."
              : "Select a lane and target, then align the board reading with the physical impact."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="hud-glass inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl admin-text-xs font-semibold hud-text-secondary hover:hud-text disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
          {isAr ? "تحديث" : "Refresh"}
        </button>
      </header>

      {targetRows.length === 0 ? (
        <div className="min-h-72 grid place-items-center text-center rounded-3xl border border-dashed border-hud hud-glass p-8">
          <div>
            <Crosshair className="w-9 h-9 mx-auto hud-text-subtle mb-3" />
            <p className="font-semibold hud-text">
              {isAr ? "لا توجد أهداف للمعايرة" : "No targets to calibrate"}
            </p>
            <p className="admin-text-xs hud-text-muted mt-1">
              {isAr
                ? "أضف هدفاً أولاً من الحارات والأهداف."
                : "Add a target in Lanes & Targets first."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] items-start">
          <aside className="hud-glass rounded-3xl p-2.5 lg:sticky lg:top-0 overflow-hidden">
            <div className="px-3 pt-2 pb-3 flex items-center gap-2">
              <MapPinned className="w-4 h-4 hud-accent" />
              <p className="admin-text-2xs font-semibold uppercase tracking-[0.14em] hud-text-muted">
                {isAr ? "الحارات" : "Lanes"}
              </p>
            </div>
            {lanes.map((lane) => {
              const count = lane.targets?.length ?? 0;
              const active = selectedLaneId === lane.id;
              return (
                <button
                  key={lane.id}
                  type="button"
                  onClick={() => selectLane(lane)}
                  disabled={count === 0}
                  className="relative isolate w-full text-start rounded-2xl px-3 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
                >
                  {active && (
                    <motion.span
                      layoutId="calibration-lane-selection"
                      className="absolute inset-0 -z-10 rounded-2xl bg-[var(--hud-accent-bg-subtle)] border border-[var(--hud-accent-border)]"
                      transition={selectionTransition}
                    />
                  )}
                  <span className="flex items-center gap-3">
                    <span
                      className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${active ? "bg-[var(--hud-accent)] text-black" : "bg-hud-elevated hud-text-muted"}`}
                    >
                      <span className="admin-text-xs font-bold tabular-nums">
                        {lane.id}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block admin-text-sm font-semibold hud-text truncate">
                        {lane.name}
                      </span>
                      <span className="block admin-text-2xs hud-text-muted mt-0.5">
                        {count}{" "}
                        {isAr ? "هدف" : count === 1 ? "target" : "targets"}
                      </span>
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition-transform ${active ? "hud-accent translate-x-0.5" : "hud-text-subtle"} ${isAr ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
              );
            })}
          </aside>

          <div className="min-w-0 space-y-4">
            {selectedLane && (
              <div className="hud-glass rounded-3xl p-4 md:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="admin-text-2xs font-semibold uppercase tracking-[0.14em] hud-text-muted">
                      {isAr ? "الحارة المحددة" : "Selected lane"}
                    </p>
                    <h2 className="admin-text-lg leading-tight font-bold tracking-[-0.015em] hud-text mt-1">
                      {selectedLane.name}
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-hud-elevated px-3 py-1.5 admin-text-2xs font-semibold hud-text-muted">
                    <TargetIcon className="w-3.5 h-3.5" />
                    {laneTargets.length}{" "}
                    {isAr
                      ? "هدف"
                      : laneTargets.length === 1
                        ? "target"
                        : "targets"}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {laneTargets.map((target) => {
                    const active = selectedTargetId === target.id;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => setSelectedTargetId(target.id)}
                        className="relative isolate text-start rounded-2xl px-3.5 py-3.5 min-w-0 overflow-hidden border border-hud hover:border-[var(--hud-accent-border)] transition-colors"
                      >
                        {active && (
                          <motion.span
                            layoutId="calibration-target-selection"
                            className="absolute inset-0 -z-10 bg-[var(--hud-accent-bg-subtle)]"
                            transition={selectionTransition}
                          />
                        )}
                        <span className="flex items-start gap-3">
                          <span className="grid place-items-center w-9 h-9 rounded-xl bg-hud-elevated hud-accent shrink-0">
                            <Crosshair className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block admin-text-sm font-semibold hud-text truncate">
                              {target.label}
                            </span>
                            <span className="flex items-center gap-2 admin-text-2xs hud-text-muted mt-1.5">
                              <span className="inline-flex items-center gap-1">
                                <Ruler className="w-3 h-3" />
                                {target.distanceM} m
                              </span>
                              <span>{target.profileType}</span>
                            </span>
                            <span className="flex items-center gap-1 admin-text-2xs font-mono hud-text-subtle mt-1 truncate">
                              <Wifi className="w-3 h-3 shrink-0" />
                              {target.ipAddress}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {selected && (
                <motion.div
                  key={selected.target.id}
                  initial={
                    reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={selectionTransition}
                >
                  <TargetCalibrationPanel
                    target={selected.target}
                    siblings={siblings}
                    isAr={isAr}
                    onNotice={triggerSuccessBanner}
                    onError={triggerErrorBanner}
                    addAdminLog={addAdminLog}
                    onCalibrated={mergeTarget}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </section>
  );
}
