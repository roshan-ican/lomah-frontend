import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "../../../../utils/api";
import { ConfirmDialog } from "../../../../components/common/ConfirmDialog";
import type { Target, WiperPage, WiperPageValues } from "../../../../types";

interface Props {
  target: Target;
  isAr: boolean;
  onNotice: (msg: string) => void;
  addAdminLog?: (msg: string) => void;
  /** Mirror the 'G'/'W' round trips into the sensor console packet log, so a
   *  calibration change shows the same real bytes PLAY/STOP/SELF-TEST do
   *  rather than being the one command that happens invisibly. */
  onPacket?: (
    targetId: string,
    command: string,
    direction: "tx" | "rx",
    hex: string,
    ascii: string,
    status: "pending" | "success" | "error" | "info",
    description: string,
  ) => void;
}

/** Same rendering the console uses for tx/rx frames — printable bytes through,
 *  everything else a dot. Kept in step with LaneHardwarePanel's copy. */
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

  const PAGES: WiperPage[] = ["A", "B"];
  const WIPER_COUNT = 5;

  /**
   * Per-target sensitivity ("wiper position") reader/writer.
   *
   * Live only — nothing here is persisted anywhere but the board itself, and
   * every open/refresh/page-switch is a fresh ~700-800ms UDP round trip. No
   * polling: a board that might be arming a relay any minute should not have
   * background traffic sent to it just because this panel is expanded.
   *
   * Wiper→physical-sensor mapping is not documented: there are 5 trimmers per
   * page × 2 pages = 10 channels, and the device's separate diagnostic ('D')
   * reports 8 sensors (L1-L4, R1-R4) — the counts do not even match. Channels
   * are therefore addressed only as Calibration A1..A5 / Calibration B1..B5,
   * never as "left sensor" or similar, anywhere this type is displayed.
   */
export function TargetSensitivityPanel({
  target,
  isAr,
  onNotice,
  addAdminLog,
  onPacket,
}: Props) {
  const [page, setPage] = useState<WiperPage>("A");
  const [values, setValues] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** Uncommitted slider positions, keyed by wiper index (0-based). Kept apart
   *  from `values` so dragging never fires a request per pixel — see
   *  commitWiper, which is the only thing that actually writes. */
  const [drafts, setDrafts] = useState<Map<number, number>>(new Map());
  const [savingWiper, setSavingWiper] = useState<number | null>(null);
  /** A wiper change awaiting the operator's "are you sure" before it is sent
   *  to the board. Written only after explicit confirmation, then logged. */
  const [pendingCommit, setPendingCommit] = useState<{
    wiperIndex: number;
    value: number;
  } | null>(null);

  const load = async (forPage: WiperPage) => {
    setLoading(true);
    setDrafts(new Map());
    try {
      const result = await api.get<WiperPageValues>(
        `/targets/${target.id}/wipers?page=${forPage}`,
      );
      setValues(result.values);
      onPacket?.(
        target.id,
        "G",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `READ WIPER ${forPage} → ${target.ipAddress}`,
      );
      onPacket?.(
        target.id,
        "G",
        "rx",
        result.rxHex ?? "(no reply)",
        hexToAscii(result.rxHex),
        "success",
        `Calibration ${forPage}: ${result.values
          .map((v, i) => `${forPage}${i + 1}=${v}`)
          .join(" ")}`,
      );
    } catch (err) {
      setValues(null);
      const msg = err instanceof Error ? err.message : "Failed to read wipers";
      onPacket?.(target.id, "G", "rx", "(no reply)", "—", "error", msg);
      onNotice(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, target.id]);


  const requestCommitWiper = (wiperIndex: number, value: number) => {
    const current = values?.[wiperIndex];
    // Released on the value already on the board — no write needed, just drop
    // the draft so the display returns to the committed reading.
    if (current !== undefined && value === current) {
      setDrafts((prev) => {
        const next = new Map(prev);
        next.delete(wiperIndex);
        return next;
      });
      return;
    }
    setPendingCommit({ wiperIndex, value });
  };


  const doWriteWiper = async () => {
    if (!pendingCommit) return;
    const { wiperIndex, value } = pendingCommit;
    setPendingCommit(null);
    setSavingWiper(wiperIndex);
    try {
      const result = await api.patch<WiperPageValues>(
        `/targets/${target.id}/wipers`,
        { page, wiper: wiperIndex + 1, value },
      );
      setValues(result.values);
      setDrafts((prev) => {
        const next = new Map(prev);
        next.delete(wiperIndex);
        return next;
      });
      // Same treatment PLAY/STOP/SELF-TEST get: the frame that went out, then
      // the board's own reply — which is the whole updated page, not an echo
      // of what was asked for.
      onPacket?.(
        target.id,
        "W",
        "tx",
        result.txHex,
        hexToAscii(result.txHex),
        "info",
        `WRITE WIPER ${page}${wiperIndex + 1}=${value} → ${target.ipAddress}`,
      );
      onPacket?.(
        target.id,
        "W",
        "rx",
        result.rxHex ?? "(no reply)",
        hexToAscii(result.rxHex),
        "success",
        `Calibration ${page} now: ${result.values
          .map((v, i) => `${page}${i + 1}=${v}`)
          .join(" ")}`,
      );
      addAdminLog?.(
        `SENSITIVITY: ${target.label} (${target.ipAddress}) ${page}${wiperIndex + 1} set to ${value}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Write failed";
      onPacket?.(
        target.id,
        "W",
        "rx",
        "(no reply)",
        "—",
        "error",
        `${page}${wiperIndex + 1}=${value}: ${msg}`,
      );
      onNotice(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
      // Drop the draft either way — it's now unconfirmed and holding onto it
      // would show a value the board never actually accepted.
      setDrafts((prev) => {
        const next = new Map(prev);
        next.delete(wiperIndex);
        return next;
      });
    } finally {
      setSavingWiper(null);
    }
  };

  const displayed = (i: number): number => drafts.get(i) ?? values?.[i] ?? 0;

  return (
    <div className="rounded-lg border border-hud bg-hud-elevated/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {PAGES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              disabled={loading}
              className={`px-2.5 py-1 rounded admin-text-xs font-mono font-bold cursor-pointer transition-colors disabled:cursor-wait ${
                page === p
                  ? "hud-accent bg-[var(--hud-accent-bg-subtle)]"
                  : "hud-text-subtle hover:hud-text"
              }`}
            >
              {isAr ? `معايرة ${p}` : `Calibration ${p}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load(page)}
          disabled={loading}
          title={isAr ? "إعادة القراءة من الجهاز" : "Re-read from the board"}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded admin-text-xs font-mono hud-text-subtle hover:hud-text cursor-pointer disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {isAr ? "تحديث" : "Refresh"}
        </button>
      </div>

      {values === null && !loading ? (
        <p className="admin-text-xs font-mono text-amber-500">
          {isAr
            ? "تعذّرت قراءة الحساسية — تحقّق من أن الهدف متصل."
            : "Could not read sensitivity — check that the board is reachable."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {Array.from({ length: WIPER_COUNT }, (_v, i) => i).map((i) => {
    
            const busy = savingWiper === i || loading || pendingCommit !== null;
            const val = displayed(i);
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider">
                    {page}
                    {i + 1}
                  </span>
                  <span className="admin-text-2xs font-mono hud-text tabular-nums">
                    {savingWiper === i ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : (
                      val
                    )}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  value={val}
                  disabled={busy || values === null}
                  className="hud-form-range w-full"
                  onChange={(e) =>
                    setDrafts((prev) =>
                      new Map(prev).set(i, Number(e.target.value)),
                    )
                  }
                  // Commit on release/blur, never on every onChange — dragging
                  // fires dozens of change events, and each commit here is a
                  // ~750ms serialised UDP write. Committing per-pixel would
                  // back the per-target queue up for the better part of a
                  // minute for one drag.
                  onPointerUp={(e) =>
                    void requestCommitWiper(i, Number((e.target as HTMLInputElement).value))
                  }
                  onKeyUp={(e) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(
                        e.key,
                      )
                    ) {
                      void requestCommitWiper(i, Number((e.target as HTMLInputElement).value));
                    }
                  }}
                />
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={val}
                  disabled={busy || values === null}
                  onChange={(e) =>
                    setDrafts((prev) =>
                      new Map(prev).set(
                        i,
                        Math.max(0, Math.min(255, Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  onBlur={(e) => void requestCommitWiper(i, Number(e.target.value) || 0)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="w-full text-center admin-text-xs font-mono px-1.5 py-1 rounded border border-hud/40 bg-transparent hover:border-hud focus:border-[var(--hud-accent-border)] outline-none transition-colors disabled:opacity-50"
                />
              </div>
            );
          })}
        </div>
      )}

      <p className="admin-text-2xs font-mono hud-text-subtle leading-relaxed pt-1 border-t border-hud/40">
        {isAr
          ? "لا يوجد توثيق لربط الحساسات بالمقاومات المتغيرة. غيّر قيمة واحدة، شغّل اختبار الهدف، ولاحظ الأثر. القيم مباشرة من الجهاز ولا تُحفظ في أي مكان."
          : "Wiper→sensor mapping is not documented. Change one value, run a self-test, and observe. Values are live on the board and are not saved anywhere."}
      </p>

      <ConfirmDialog
        open={pendingCommit !== null}
        title={isAr ? "تأكيد تغيير الحساسية" : "Confirm Sensitivity Change"}
        message={
          pendingCommit
            ? isAr
              ? `هل أنت متأكد أنك تريد تغيير ${page}${pendingCommit.wiperIndex + 1} للهدف ${target.label} إلى ${pendingCommit.value}؟`
              : `Are you sure you want to change ${page}${pendingCommit.wiperIndex + 1} on ${target.label} to ${pendingCommit.value}?`
            : ""
        }
        language={isAr ? "ar" : "en"}
        confirmLabel={isAr ? "تغيير" : "Change"}
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        variant="primary"
        onConfirm={() => void doWriteWiper()}
        onCancel={() => {
          if (pendingCommit) {
            // Revert the draft so the displayed value falls back to whatever
            // the board last confirmed.
            setDrafts((prev) => {
              const next = new Map(prev);
              next.delete(pendingCommit.wiperIndex);
              return next;
            });
          }
          setPendingCommit(null);
        }}
      />
    </div>
  );
}
