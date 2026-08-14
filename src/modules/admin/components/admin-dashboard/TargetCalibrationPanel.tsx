import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Crosshair,
  Loader2,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { api } from "../../../../utils/api";
import { ConfirmDialog } from "../../../../components/common/ConfirmDialog";
import {
  CalibrationTargetFace,
  type CalibrationRead,
} from "./CalibrationTargetFace";
import { CalibrationFaceDialog } from "./CalibrationFaceDialog";
import type { TargetBenchHitEvent } from "@shared/types/events";
import type {
  Target,
  TargetPlayResult,
  TargetReadShotResult,
  TargetStopResult,
} from "../../../../types";

interface Props {
  target: Target;
  /** Every other commissioned target, for the "apply to these too" step. */
  siblings: Target[];
  isAr: boolean;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
  addAdminLog?: (msg: string) => void;
  /** Mirror the round trips into the sensor console's packet log, the same way
   *  the sensitivity panel does — a calibration should not be the one command
   *  that happens invisibly. */
  onPacket?: (
    targetId: string,
    command: string,
    direction: "tx" | "rx",
    hex: string,
    ascii: string,
    status: "pending" | "success" | "error" | "info",
    description: string,
  ) => void;
  /** A calibrated target carries a new offset — the row above shows it. */
  onCalibrated: (saved: Target) => void;
}

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

/**
 * Commissioning calibration — "fire one at a known point, tell me where it
 * actually was".
 *
 * Distinct from the ADMIN board's drag-to-calibrate, which moves an
 * already-scored shot from a live relay. There is no session here: the bullet
 * exists only on the board's own counter, so the flow is arm → fire → read
 * shot #N back off the wire → derive the offset from that reading. The server
 * re-reads the shot itself (POST :id/calibrate-bench), so nothing this panel
 * displays can skew the result.
 */
export function TargetCalibrationPanel({
  target,
  siblings,
  isAr,
  onNotice,
  onError,
  addAdminLog,
  onPacket,
  onCalibrated,
}: Props) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState<
    null | "arm" | "disarm" | "read" | "apply" | "reset"
  >(null);
  const [shot, setShot] = useState(1);
  const [trueX, setTrueX] = useState(0);
  const [trueY, setTrueY] = useState(0);
  /** (0, 0) is dead centre, a legitimate mark — so "has the operator marked a
   *  point yet" needs its own flag rather than being read off the numbers. */
  const [trueMarked, setTrueMarked] = useState(false);
  /** Last raw reading pulled back off the board, for the preview line. */
  const [reading, setReading] = useState<TargetReadShotResult | null>(null);
  /** Every bench read plotted on the face, newest last. A commissioning pass
   *  is one or two bullets, so both stay on the board and the operator picks
   *  which one the offset comes from. */
  const [reads, setReads] = useState<CalibrationRead[]>([]);
  /** Targets the operator has ticked to receive this same offset. */
  const [applyTo, setApplyTo] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState<null | "calibrate" | "reset">(
    null,
  );
  /** The face, opened big. Marking happens there — see the inline face below. */
  const [expanded, setExpanded] = useState(false);
  /**
   * Set once a calibration has landed, cleared the moment the operator starts
   * working towards the next one.
   *
   * Without it the panel keeps showing the working-out after the answer is in:
   * the derivation preview reads "derived (x, y) — currently (x, y)", which is
   * a sum whose two sides are now the same number, and the bench-read box still
   * advertises a reading that has already been consumed. Both invite the
   * operator to wonder what is still outstanding when the answer is "nothing".
   */
  const [applied, setApplied] = useState<null | {
    offsetXmm: number;
    offsetYmm: number;
    shot: number;
    carried: number;
  }>(null);

  /**
   * Bullets as they land.
   *
   * The board pushes every hit the moment it detects one, armed or not; with no
   * session behind it the backend records nothing and now says so on
   * target:bench-hit. Read back is unchanged and still the way to pull a
   * specific older bullet off the board by number — this is the same reading
   * arriving on its own, so a commissioning pass can be watched instead of
   * interrogated.
   *
   * Only while armed: an unarmed board should not be quietly repopulating a
   * face the operator is in the middle of marking against.
   */
  const onBenchHit = (hit: TargetBenchHitEvent) => {
    if (hit.targetId !== target.id) return;
    // A no-detection carries no position — plotting it would put a bullet at
    // dead centre that nothing fired there.
    if (hit.isMiss) {
      onNotice(
        isAr
          ? `الطلقة رقم ${hit.shot} — لم يتعرّف الجهاز على موضعها`
          : `Shot #${hit.shot} — the board detected no position for it`,
      );
      return;
    }
    // Sensor space, exactly as readBack stores it: held raw, every marker
    // re-plots against the current offset, so applying a calibration visibly
    // walks the bullet onto the point the operator marked.
    const read: CalibrationRead = {
      shot: hit.shot,
      sensorX: hit.xMm - target.offsetXmm,
      sensorY: hit.yMm - target.offsetYmm,
      score: hit.score,
    };
    setReads((prev) => [...prev.filter((r) => r.shot !== read.shot), read]);
    // Follow the newest bullet: it is the one the operator just fired and the
    // one they are about to mark against.
    setShot(hit.shot);
    setApplied(null);
    onPacket?.(
      target.id,
      "L",
      "rx",
      "(pushed)",
      "—",
      "success",
      `LIVE shot #${hit.shot} at (${hit.xMm}, ${hit.yMm}) mm — bench hit, not a session shot.`,
    );
  };

  // Held in a ref and refreshed every render so the subscription below can
  // depend on `armed` alone. Depending on the handler directly would tear the
  // listener down and re-add it on every render — the parent passes onNotice
  // and onPacket inline — and a bullet landing inside that window would be the
  // one bullet nobody sees.
  const benchHitRef = useRef(onBenchHit);
  useEffect(() => {
    benchHitRef.current = onBenchHit;
  });

  useEffect(() => {
    if (!armed) return;
    const listener = (e: Event) => {
      const hit = (e as CustomEvent<TargetBenchHitEvent>).detail;
      if (hit) benchHitRef.current(hit);
    };
    window.addEventListener("lomah:bench-hit", listener);
    return () => window.removeEventListener("lomah:bench-hit", listener);
  }, [armed]);

  const hasOffset = target.offsetXmm !== 0 || target.offsetYmm !== 0;
  const selectedRead = reads.find((r) => r.shot === shot) ?? null;

  /**
   * What the offset WILL be, computed the same way the server computes it.
   *
   * The server derives `offset = true - sensor` from its own re-read, and the
   * reads held here are already in sensor space, so this preview is the same
   * subtraction on the same quantities — not an independent guess that could
   * disagree with the value that actually lands.
   */
  const derived = selectedRead && trueMarked
    ? { x: trueX - selectedRead.sensorX, y: trueY - selectedRead.sensorY }
    : null;

  const toggleApply = (id: string) =>
    setApplyTo((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const arm = async () => {
    setBusy("arm");
    try {
      const result = await api.post<TargetPlayResult>(
        `/targets/${target.id}/play`,
      );
      setArmed(result.armed);
      onPacket?.(
        target.id,
        "P",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `PLAY (calibration) → ${target.ipAddress}`,
      );
      onPacket?.(
        target.id,
        "P",
        "rx",
        result.rxHex ?? "(no reply)",
        hexToAscii(result.rxHex),
        result.armed ? "success" : "error",
        result.message,
      );
      onNotice(
        result.armed
          ? isAr
            ? `${target.label} مسلَّح — أطلق طلقة على نقطة معروفة.`
            : `${target.label} armed — fire one bullet at a known point.`
          : result.message,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Arm failed");
    } finally {
      setBusy(null);
    }
  };

  const disarm = async () => {
    setBusy("disarm");
    try {
      const result = await api.post<TargetStopResult>(
        `/targets/${target.id}/stop`,
      );
      setArmed(false);
      onPacket?.(
        target.id,
        "S",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `STOP (calibration) → ${target.ipAddress}`,
      );
      onNotice(result.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Disarm failed");
    } finally {
      setBusy(null);
    }
  };

  /** Preview only — the calibrate call re-reads the shot server-side. */
  const readBack = async () => {
    setBusy("read");
    setReading(null);
    // A fresh bullet off the board is the start of the next derivation, so the
    // previous calibration stops being the headline.
    setApplied(null);
    try {
      const result = await api.post<TargetReadShotResult>(
        `/targets/${target.id}/read-shot`,
        { shot },
      );
      setReading(result);
      // Plot it. Stored in sensor space (the corrected pair minus the offset
      // that produced it) so the marker keeps meaning "what the board saw"
      // even after an offset is applied underneath it.
      if (result.xMm != null && result.yMm != null) {
        const read: CalibrationRead = {
          shot: result.shot,
          sensorX: result.xMm - target.offsetXmm,
          sensorY: result.yMm - target.offsetYmm,
          score: result.score,
        };
        setReads((prev) => [...prev.filter((r) => r.shot !== read.shot), read]);
      }
      onPacket?.(
        target.id,
        "L",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `CAL READ SHOT #${shot} → ${target.ipAddress}`,
      );
      onPacket?.(
        target.id,
        "L",
        "rx",
        result.rxHex ?? "(no reply)",
        hexToAscii(result.rxHex),
        result.ok ? "success" : "error",
        result.xMm != null && result.yMm != null
          ? `CAL shot #${shot} seen at (${result.xMm}, ${result.yMm}) mm — bench read, not a session shot.`
          : result.message,
      );
      onNotice(result.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Read failed");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Back to (0, 0) — the board reports raw sensor millimetres again.
   *
   * Its own action rather than "type two zeros and re-derive": a bad offset is
   * exactly the state in which the operator cannot trust a derivation, and
   * clearing it is how they get back to a board whose readings mean what they
   * say before firing the calibration bullet.
   */
  const doReset = async () => {
    setConfirmOpen(null);
    setBusy("reset");
    try {
      const saved = await api.patch<Target>(`/targets/${target.id}/offset`, {
        offsetXmm: 0,
        offsetYmm: 0,
      });
      onCalibrated(saved);
      setApplied(null);
      addAdminLog?.(
        `TARGET CAL: ${saved.label} (${saved.ipAddress}) offset reset to (0, 0) mm.`,
      );
      onNotice(
        isAr
          ? `${saved.label} — أُعيدت الإزاحة إلى (0، 0) مم`
          : `${saved.label} — offset reset to (0, 0) mm`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Offset reset failed");
    } finally {
      setBusy(null);
    }
  };

  const doCalibrate = async () => {
    setConfirmOpen(null);
    setBusy("apply");
    try {
      const saved = await api.post<Target>(
        `/targets/${target.id}/calibrate-bench`,
        { shot, trueX, trueY },
      );
      onCalibrated(saved);
      addAdminLog?.(
        `TARGET CAL: ${saved.label} (${saved.ipAddress}) offset ` +
          `(${saved.offsetXmm}, ${saved.offsetYmm}) mm from shot #${shot}.`,
      );

      // Carry the same mounting correction to the boards the operator ticked.
      // Sequential, not Promise.all: each is a live UDP-backed write and the
      // per-target queues are serialised anyway, so firing them together only
      // makes a partial failure harder to report.
      const carried: string[] = [];
      for (const sib of siblings.filter((s) => applyTo.has(s.id))) {
        try {
          const other = await api.patch<Target>(`/targets/${sib.id}/offset`, {
            offsetXmm: saved.offsetXmm,
            offsetYmm: saved.offsetYmm,
          });
          onCalibrated(other);
          carried.push(other.label);
        } catch (err) {
          onError(
            `${sib.label}: ${err instanceof Error ? err.message : "offset copy failed"}`,
          );
        }
      }
      if (carried.length) {
        addAdminLog?.(
          `TARGET CAL: offset (${saved.offsetXmm}, ${saved.offsetYmm}) mm ` +
            `also applied to ${carried.join(", ")}.`,
        );
      }
      setApplyTo(new Set());
      setApplied({
        offsetXmm: saved.offsetXmm,
        offsetYmm: saved.offsetYmm,
        shot,
        carried: carried.length,
      });

      onNotice(
        isAr
          ? `تمت المعايرة — إزاحة (${saved.offsetXmm}, ${saved.offsetYmm}) مم${
              carried.length ? ` — وطُبِّقت على ${carried.length} هدف آخر` : ""
            }`
          : `Calibrated — offset (${saved.offsetXmm}, ${saved.offsetYmm}) mm${
              carried.length
                ? `, also applied to ${carried.length} other target${carried.length === 1 ? "" : "s"}`
                : ""
            }`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Calibration failed");
    } finally {
      setBusy(null);
    }
  };

  const numCls =
    "w-20 text-center admin-text-sm font-mono px-2 py-1.5 rounded border border-hud/40 bg-transparent hover:border-hud focus:border-[var(--hud-accent-border)] outline-none transition-colors disabled:opacity-50";
  const labelCls =
    "admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider mb-1 block";

  return (
    <div className="rounded-lg border border-hud bg-hud-elevated/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="admin-text-xs font-mono hud-accent uppercase tracking-wider font-bold">
          {isAr ? "معايرة الهدف" : "Target Calibration"}
        </p>
        <div className="flex items-center gap-2">
          <span className="admin-text-2xs font-mono hud-text-subtle">
            {isAr ? "الإزاحة الحالية" : "Current offset"}{" "}
            <span className="hud-text font-bold tabular-nums">
              ({target.offsetXmm}, {target.offsetYmm}) mm
            </span>
          </span>
          <button
            type="button"
            onClick={() => setConfirmOpen("reset")}
            disabled={busy !== null || !hasOffset}
            title={
              hasOffset
                ? isAr
                  ? "أعِد الإزاحة إلى (0، 0)"
                  : "Reset the offset back to (0, 0)"
                : isAr
                  ? "الإزاحة صفر بالفعل"
                  : "Offset is already zero"
            }
            className="inline-flex items-center gap-1 px-2 py-1 rounded admin-text-2xs font-mono font-bold border border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy === "reset" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            {isAr ? "تصفير" : "Reset"}
          </button>
        </div>
      </div>

      {/* Step 1 — arm and fire */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="admin-text-2xs font-mono hud-text-subtle shrink-0">
          {isAr ? "١. سلِّح وأطلق" : "1. Arm & fire"}
        </span>
        <button
          type="button"
          onClick={() => void arm()}
          disabled={busy !== null || armed}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded admin-text-xs font-mono font-bold border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === "arm" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {isAr ? "تسليح" : "Arm"}
        </button>
        <button
          type="button"
          onClick={() => void disarm()}
          disabled={busy !== null || !armed}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded admin-text-xs font-mono font-bold border border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === "disarm" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Square className="w-3 h-3" />
          )}
          {isAr ? "إيقاف" : "Disarm"}
        </button>
        {armed && (
          <span className="admin-text-2xs font-mono text-amber-600 dark:text-amber-400 animate-pulse">
            {isAr ? "مسلَّح — أطلق الآن" : "Armed — fire now"}
          </span>
        )}
      </div>

      {/* Step 2 — read the bullet back onto the face, then mark where it
          really is. The face is the whole point: the numbers below are a
          readout of the two markers, not the only way in.

          Inline it is a preview: at 240px a millimetre is a quarter of a pixel,
          so clicking it opens the fullscreen view and the mark is placed there,
          zoomed into the hole. The True X / Y boxes still take typed
          coordinates without going near the dialog. */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="space-y-1.5 shrink-0">
          <CalibrationTargetFace
            profileType={target.profileType}
            reads={reads}
            offsetXmm={target.offsetXmm}
            offsetYmm={target.offsetYmm}
            selectedShot={shot}
            trueX={trueX}
            trueY={trueY}
            trueMarked={trueMarked}
            onPickTrue={() => setExpanded(true)}
            connectReads
            hint={
              isAr
                ? "وجه الهدف — انقر لفتح العرض الكامل"
                : "Target face — click to open the full view"
            }
            disabled={busy !== null}
            isAr={isAr}
          />
          <div className="flex items-center gap-2 flex-wrap admin-text-2xs font-mono hud-text-subtle">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {isAr ? "رآها الجهاز" : "Board saw"}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {isAr ? "الموضع الحقيقي" : "True position"}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-[16rem] space-y-2.5">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className={labelCls}>{isAr ? "رقم الطلقة" : "Shot #"}</label>
          <input
            type="number"
            min={1}
            max={100}
            value={shot}
            disabled={busy !== null}
            onChange={(e) =>
              setShot(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
            }
            className={numCls}
          />
        </div>
        <div>
          <label className={labelCls}>{isAr ? "س الحقيقي (مم)" : "True X (mm)"}</label>
          <input
            type="number"
            value={trueX}
            disabled={busy !== null}
            onChange={(e) => {
              setTrueX(Number(e.target.value) || 0);
              setTrueMarked(true);
              setApplied(null);
            }}
            className={numCls}
          />
        </div>
        <div>
          <label className={labelCls}>{isAr ? "ص الحقيقي (مم)" : "True Y (mm)"}</label>
          <input
            type="number"
            value={trueY}
            disabled={busy !== null}
            onChange={(e) => {
              setTrueY(Number(e.target.value) || 0);
              setTrueMarked(true);
              setApplied(null);
            }}
            className={numCls}
          />
        </div>
        <button
          type="button"
          onClick={() => void readBack()}
          disabled={busy !== null}
          title={
            isAr
              ? "اقرأ ما رآه الجهاز لهذه الطلقة (معاينة فقط)"
              : "Read back what the board saw for this shot (preview only)"
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded admin-text-xs font-mono font-bold hud-btn-secondary cursor-pointer disabled:opacity-50 transition-colors"
        >
          {busy === "read" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Crosshair className="w-3 h-3" />
          )}
          {isAr ? "قراءة" : "Read back"}
        </button>
      </div>

      {/* One chip per bullet on the face. A commissioning pass is one or two
          shots; the chips are how the operator says which of them the offset
          is derived from, and the face follows the pick. */}
      {reads.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="admin-text-2xs font-mono hud-text-subtle">
            {isAr ? "الطلقات المقروءة" : "Reads"}
          </span>
          {reads.map((r) => {
            const isSel = r.shot === shot;
            return (
              <span
                key={r.shot}
                className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border admin-text-2xs font-mono transition-colors ${
                  isSel
                    ? "border-amber-500/60 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                    : "border-hud/40 hud-text-subtle"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShot(r.shot)}
                  disabled={busy !== null}
                  className="cursor-pointer disabled:cursor-not-allowed tabular-nums"
                >
                  #{r.shot} ({r.sensorX + target.offsetXmm},{" "}
                  {r.sensorY + target.offsetYmm})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setReads((prev) => prev.filter((p) => p.shot !== r.shot))
                  }
                  disabled={busy !== null}
                  title={isAr ? "إزالة من اللوحة" : "Remove from the face"}
                  className="p-0.5 rounded hover:bg-hud-elevated cursor-pointer disabled:cursor-not-allowed"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Done. Stated once, in place of the working-out — the derivation
          preview and the bench-read box below are both about a calibration
          that has not landed yet, and leaving them up after one has makes a
          finished board look like an unfinished one.

          The amber markers stay on the face on purpose: they are held in
          sensor space, so applying the offset walks them onto the green mark,
          and that movement is the proof the calibration did what it claimed. */}
      {applied && (
        <div className="rounded border border-emerald-500/50 bg-emerald-500/10 p-2 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="admin-text-2xs font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {isAr ? "تمت معايرة الهدف" : "Target calibrated"}
            </span>
          </div>
          <p className="admin-text-2xs font-mono text-slate-800 dark:text-slate-200">
            {isAr ? "الإزاحة" : "Offset"}{" "}
            <span className="font-bold tabular-nums">
              ({applied.offsetXmm}, {applied.offsetYmm}) mm
            </span>{" "}
            {isAr ? `من الطلقة رقم ${applied.shot}` : `from shot #${applied.shot}`}
            {applied.carried > 0 &&
              (isAr
                ? ` — وطُبِّقت على ${applied.carried} هدف آخر`
                : `, also applied to ${applied.carried} other target${
                    applied.carried === 1 ? "" : "s"
                  }`)}
          </p>
          <p className="admin-text-2xs font-mono hud-text-subtle">
            {isAr
              ? "اقرأ طلقة أخرى أو حدِّد نقطة جديدة لبدء معايرة أخرى."
              : "Read another shot or mark a new point to start another calibration."}
          </p>
        </div>
      )}

      {/* The offset this is about to write, before it is written. Same
          subtraction the server performs on its own re-read, so the number
          shown here is the number that lands. */}
      {!applied && derived && (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 admin-text-2xs font-mono text-slate-800 dark:text-slate-200 space-y-0.5">
          <p>
            {isAr ? "الطلقة" : "Shot"} #{shot}:{" "}
            {isAr ? "رآها الجهاز عند" : "board saw"}{" "}
            <span className="font-bold tabular-nums">
              ({selectedRead!.sensorX + target.offsetXmm},{" "}
              {selectedRead!.sensorY + target.offsetYmm})
            </span>{" "}
            → {isAr ? "الحقيقي" : "true"}{" "}
            <span className="font-bold tabular-nums">
              ({trueX}, {trueY})
            </span>{" "}
            mm
          </p>
          <p>
            {isAr ? "الإزاحة الناتجة" : "Derived offset"}{" "}
            <span className="font-bold tabular-nums">
              ({derived.x}, {derived.y}) mm
            </span>{" "}
            <span className="hud-text-subtle">
              {isAr
                ? `(الحالية ${target.offsetXmm}، ${target.offsetYmm})`
                : `(currently ${target.offsetXmm}, ${target.offsetYmm})`}
            </span>
          </p>
        </div>
      )}

      {/* Badged, not a bare message line. These readings are bench bullets
          pulled off the board's own counter for commissioning — they are never
          written as Shot rows and belong to no session, and an unlabelled pair
          of millimetres here is indistinguishable from a scored shot on the
          live board. The badge is the only thing saying which it is. */}
      {!applied && reading && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-1.5 py-0.5 rounded admin-text-2xs font-mono font-bold uppercase tracking-wider border border-amber-500/50 text-amber-700 dark:text-amber-300">
              {isAr ? "طلقة معايرة" : "Calibration shot"}
            </span>
            <span className="admin-text-2xs font-mono hud-text-subtle">
              #{reading.shot} · {isAr ? "غير مسجّلة في أي جلسة" : "not recorded in any session"}
            </span>
          </div>
          {reading.xMm != null && reading.yMm != null ? (
            <p className="admin-text-2xs font-mono text-slate-800 dark:text-slate-200">
              {isAr ? "رآها الجهاز عند" : "Board saw it at"}{" "}
              <span className="font-bold tabular-nums">
                ({reading.xMm}, {reading.yMm}) mm
              </span>
            </p>
          ) : (
            <p className="admin-text-2xs font-mono break-words text-slate-800 dark:text-slate-200">
              {reading.message}
            </p>
          )}
        </div>
      )}
        </div>
      </div>

      {/* Step 3 — carry it to the other boards */}
      {siblings.length > 0 && (
        <div className="pt-2 border-t border-hud/40 space-y-1.5">
          <p className={labelCls}>
            {isAr
              ? "طبّق الإزاحة نفسها على أهداف أخرى"
              : "Also apply this offset to"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((s) => (
              <label
                key={s.id}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border admin-text-2xs font-mono cursor-pointer transition-colors ${
                  applyTo.has(s.id)
                    ? "border-[var(--hud-accent-border-strong)] hud-accent bg-[var(--hud-accent-bg-subtle)]"
                    : "border-hud/40 hud-text-subtle hover:border-hud"
                }`}
              >
                <input
                  type="checkbox"
                  checked={applyTo.has(s.id)}
                  disabled={busy !== null}
                  onChange={() => toggleApply(s.id)}
                  className="accent-[var(--hud-accent)] cursor-pointer"
                />
                {s.label}
                <span className="opacity-60">
                  ({s.offsetXmm}, {s.offsetYmm})
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirmOpen("calibrate")}
        // Gated on a marked point, not on a read: the server re-reads the shot
        // itself, so a read here is a preview — but a calibration with no mark
        // would silently derive against (0, 0) and claim the bullet was fired
        // dead centre.
        disabled={busy !== null || !trueMarked}
        title={
          trueMarked
            ? undefined
            : isAr
              ? "حدِّد أولاً موضع الطلقة الحقيقي على وجه الهدف"
              : "Mark the bullet's true position on the face first"
        }
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded admin-text-xs font-mono font-bold hud-btn-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy === "apply" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Crosshair className="w-3.5 h-3.5" />
        )}
        {isAr ? "احسب الإزاحة وطبّقها" : "Derive offset & apply"}
      </button>

      <p className="admin-text-2xs font-mono hud-text-subtle leading-relaxed">
        {isAr
          ? "سلِّح الهدف، أطلق طلقة أو طلقتين، ثم اقرأ كل طلقة برقمها لتظهر على وجه الهدف (بالبرتقالي). انقر على وجه الهدف لفتحه بالحجم الكامل، حيث يمكن التكبير والتحريك وقراءة طلقات أخرى، ثم حدِّد الثقب الحقيقي (بالأخضر) — الفرق بين النقطتين هو إزاحة التركيب. يُعاد قراءة الطلقة من الجهاز عند التطبيق. مركز الوجه هو (٠، ٠)."
          : "Arm the target, fire one or two bullets, then read each shot number back — it appears on the face in amber. Click the face to open it full size, where you can zoom, pan and read further shots, then mark where the hole really is (green); the gap between the two markers is the mounting offset. The shot is re-read from the board on apply. Centre of the face is (0, 0)."}
      </p>

      <CalibrationFaceDialog
        open={expanded}
        onClose={() => setExpanded(false)}
        profileType={target.profileType}
        reads={reads}
        offsetXmm={target.offsetXmm}
        offsetYmm={target.offsetYmm}
        selectedShot={shot}
        onSelectShot={setShot}
        trueX={trueX}
        trueY={trueY}
        trueMarked={trueMarked}
        onPickTrue={(x, y) => {
          setTrueX(x);
          setTrueY(y);
          setTrueMarked(true);
          setApplied(null);
        }}
        onReadBack={() => void readBack()}
        busy={busy}
        isAr={isAr}
      />

      <ConfirmDialog
        open={confirmOpen === "calibrate"}
        title={isAr ? "تأكيد المعايرة" : "Confirm calibration"}
        message={
          isAr
            ? `سيتم اشتقاق إزاحة ${target.label} من الطلقة رقم ${shot} بحيث تقع عند (${trueX}, ${trueY}) مم${
                applyTo.size
                  ? ` وتطبيقها أيضاً على ${applyTo.size} هدف آخر`
                  : ""
              }.`
            : `${target.label}'s offset will be derived from shot #${shot} landing at (${trueX}, ${trueY}) mm${
                applyTo.size
                  ? `, and applied to ${applyTo.size} other target${applyTo.size === 1 ? "" : "s"} as well`
                  : ""
              }.`
        }
        language={isAr ? "ar" : "en"}
        confirmLabel={isAr ? "معايرة" : "Calibrate"}
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        variant="primary"
        onConfirm={() => void doCalibrate()}
        onCancel={() => setConfirmOpen(null)}
      />

      <ConfirmDialog
        open={confirmOpen === "reset"}
        title={isAr ? "تصفير الإزاحة" : "Reset offset"}
        message={
          isAr
            ? `ستعود إزاحة ${target.label} من (${target.offsetXmm}، ${target.offsetYmm}) مم إلى (٠، ٠). ستُسجَّل الطلقات بعدها كما يراها الجهاز تماماً حتى تُعاد المعايرة.`
            : `${target.label}'s offset goes from (${target.offsetXmm}, ${target.offsetYmm}) mm back to (0, 0). Shots will score exactly where the board sees them until it is calibrated again.`
        }
        language={isAr ? "ar" : "en"}
        confirmLabel={isAr ? "تصفير" : "Reset"}
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        variant="danger"
        onConfirm={() => void doReset()}
        onCancel={() => setConfirmOpen(null)}
      />
    </div>
  );
}
