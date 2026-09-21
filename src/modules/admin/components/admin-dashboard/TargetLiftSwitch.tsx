import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../../../utils/api";

type Position = "UP" | "DOWN";

const LIFT_EVENT = "lomah:lift-changed";

// How long to let the targets travel before re-reading them after a lift-all.
// Reading immediately returns the position they are moving away from, which
// flips every switch back for a moment. Keep this at or above the backend's
// TRAVEL_MS.
const LIFT_SETTLE_MS = 2000;

interface LiftStatus {
  position: Position | null;
  online: boolean;
}

interface LiftStatusRow extends LiftStatus {
  id: string;
  label: string;
}

let inflight: Promise<Map<string, LiftStatus>> | null = null;

/**
 * One request for every target's position, shared by all the switches on the
 * page. Each switch used to fetch its own, so a dashboard with N targets fired
 * N requests at boards that answer slowly and drop packets. Calls that overlap
 * reuse the request already in flight.
 */
function loadLiftStatuses(): Promise<Map<string, LiftStatus>> {
  if (inflight) return inflight;
  inflight = api
    .get<LiftStatusRow[]>("/targets/lift")
    .then(
      (rows) =>
        new Map(
          rows.map((r) => [r.id, { position: r.position, online: r.online }]),
        ),
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface LiftAllResult {
  total: number;
  moved: number;
  already: string[];
  failed: string[];
  failedIds: string[];
}

interface LiftEventDetail {
  position?: Position;
  failedIds?: string[];
}

export async function liftAllTargets(position: "UP" | "DOWN") {
  let detail: LiftEventDetail = {};
  try {
    const r = await api.post<LiftAllResult>("/targets/lift-all", { position });
    // Targets that failed keep their real state; only acknowledged ones jump ahead.
    detail = { position, failedIds: r.failedIds ?? [] };
    return r;
  } finally {
    window.dispatchEvent(new CustomEvent(LIFT_EVENT, { detail }));
  }
}

export function liftAllMessage(
  r: LiftAllResult,
  position: "UP" | "DOWN",
  isAr: boolean,
): { ok: boolean; text: string } {
  const up = position === "UP";
  const verb = up ? (isAr ? "رُفعت" : "raised") : isAr ? "خُفضت" : "lowered";
  const state = up ? (isAr ? "مرفوعة" : "up") : isAr ? "منخفضة" : "down";
  const already = r.already.length;
  if (r.failed.length > 0) {
    return {
      ok: false,
      text: isAr
        ? `${verb} ${r.moved}/${r.total} — تعذّر: ${r.failed.join(", ")}`
        : `${r.moved}/${r.total} ${verb}. No answer from: ${r.failed.join(", ")}`,
    };
  }
  if (r.moved === 0 && already > 0) {
    return {
      ok: true,
      text: isAr
        ? `كل الأهداف ${state} بالفعل — لا حاجة`
        : `All targets are already ${state}, nothing to do`,
    };
  }
  const extra =
    already > 0
      ? isAr
        ? ` (${already} ${state} بالفعل)`
        : ` (${already} already ${state})`
      : "";
  return {
    ok: true,
    text: isAr
      ? `${verb} ${r.moved} هدف${extra}`
      : `${r.moved} target${r.moved === 1 ? "" : "s"} ${verb}${extra}`,
  };
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
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onLift = (e: Event) => {
      const { position: commanded, failedIds } =
        (e as CustomEvent<LiftEventDetail>).detail ?? {};
      // The server has acknowledged the command but the targets are still
      // travelling, so show the commanded position now and confirm it later.
      if (commanded && !failedIds?.includes(targetId)) {
        setPosition(commanded);
        setOnline(true);
      }
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(
        () => setTick((n) => n + 1),
        LIFT_SETTLE_MS,
      );
    };
    window.addEventListener(LIFT_EVENT, onLift);
    return () => {
      window.removeEventListener(LIFT_EVENT, onLift);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [targetId]);

  useEffect(() => {
    let alive = true;
    loadLiftStatuses()
      .then((byId) => {
        if (!alive) return;
        const next = byId.get(targetId);
        if (!next) return;
        setOnline(next.online);
        if (next.position) setPosition(next.position);
      })
      // Keep whatever we last showed. A dropped packet is not a state change,
      // and blanking the switch made a working target look broken.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [targetId, refreshKey, tick]);

  const up = position === "UP";

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
      setOnline(true);
    } catch (err) {
      setPosition(prev);
      setOnline(false);
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

  const offline = !online || position === null;
  const label = offline
    ? isAr
      ? "لا رد"
      : "No reply"
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
      title={
        offline
          ? isAr
            ? "الهدف لا يستجيب — اضغط لإعادة المحاولة"
            : "Target not answering — click to retry"
          : isAr
            ? "رفع / خفض الهدف"
            : "Raise / lower target"
      }
      className="group inline-flex items-center gap-2 shrink-0 rounded-lg px-1.5 py-1 hover:bg-[var(--hud-elevated)] transition-colors active:scale-[0.96] disabled:cursor-wait"
    >
      <span className="grid place-items-center w-6 h-7">
        <span
          className={`block rounded-[3px] transition-all duration-300 ease-out ${
            offline
              ? "w-4 h-4 bg-zinc-500/60"
              : up
              ? "w-3 h-7 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
              : "w-4 h-4 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
          } ${busy ? "animate-pulse" : ""}`}
        />
      </span>
      <span
        className={`admin-text-xs font-semibold w-16 text-start whitespace-nowrap leading-none ${
          offline
            ? "text-zinc-400"
            : up
              ? "text-emerald-500"
              : "text-rose-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
