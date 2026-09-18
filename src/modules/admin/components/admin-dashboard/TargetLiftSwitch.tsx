import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../utils/api";

type Position = "UP" | "DOWN" | "UNKNOWN";

const LIFT_EVENT = "lomah:lift-changed";

export async function liftAllTargets(position: "UP" | "DOWN") {
  try {
    return await api.post<{ total: number; moved: number; failed: string[] }>(
      "/targets/lift-all",
      { position },
    );
  } finally {
    window.dispatchEvent(new Event(LIFT_EVENT));
  }
}

interface Props {
  targetId: string;
  isAr: boolean;
  onError: (msg: string) => void;
  refreshKey?: number;
}

export function TargetLiftSwitch({
  targetId,
  isAr,
  onError,
  refreshKey,
}: Props) {
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(LIFT_EVENT, bump);
    return () => window.removeEventListener(LIFT_EVENT, bump);
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get<{ position: Position }>(`/targets/${targetId}/lift`)
      .then((s) => alive && setPosition(s.position))
      .catch(() => alive && setPosition(null));
    return () => {
      alive = false;
    };
  }, [targetId, refreshKey, tick]);

  const up = position === "UP";
  const offline = position === null;

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    const next = up ? "DOWN" : "UP";
    const prev = position;
    setPosition(next);
    setBusy(true);
    try {
      const s = await api.post<{ position: Position }>(
        `/targets/${targetId}/lift`,
        { position: next },
      );
      setPosition(s.position);
    } catch (err) {
      setPosition(prev);
      onError(
        err instanceof ApiError
          ? err.message
          : isAr
            ? "تعذّر تحريك الهدف"
            : "Could not move target",
      );
    } finally {
      setBusy(false);
    }
  };

  const label = offline
    ? isAr
      ? "غير متصل"
      : "Offline"
    : up
      ? isAr
        ? "مرفوع"
        : "Up"
      : isAr
        ? "منخفض"
        : "Down";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={up}
      onClick={toggle}
      disabled={busy}
      title={isAr ? "رفع / خفض الهدف" : "Raise / lower target"}
      className="group inline-flex items-center gap-2 shrink-0 rounded-lg px-1.5 py-1 hover:bg-[var(--hud-elevated)] transition-colors active:scale-[0.96] disabled:cursor-wait"
    >
      <span className="grid place-items-end justify-items-center w-6 h-7">
        <span
          className={`block rounded-[3px] transition-all duration-300 ease-out ${
            offline
              ? "w-4 h-4 border-2 border-[var(--hud-text-subtle)]"
              : up
                ? "w-3 h-7 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
                : "w-4 h-4 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
          } ${busy ? "animate-pulse" : ""}`}
        />
      </span>
      <span
        className={`admin-text-xs font-semibold w-14 text-start ${
          offline ? "hud-text-muted" : up ? "text-emerald-500" : "text-rose-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
