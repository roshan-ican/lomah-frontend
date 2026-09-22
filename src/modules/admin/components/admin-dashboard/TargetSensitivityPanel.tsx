import { useEffect, useState } from "react";
import { Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
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
  const [defaults, setDefaults] = useState<number[] | null>(null);
  const [pendingBulk, setPendingBulk] = useState<"save" | "reset" | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  /** What the last failed read actually said. Kept so the panel can show the
   *  board's own reason instead of a generic "unreachable" that hides which
   *  target answered and how. */
  const [readError, setReadError] = useState<string | null>(null);
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
    setReadError(null);
    try {
      const result = await api.get<WiperPageValues>(
        `/targets/${target.id}/wipers?page=${forPage}`,
      );
      setValues(result.values);
      setDefaults(result.defaults ?? null);
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
      setReadError(msg);
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

  const atDefault =
    !!defaults && !!values && defaults.every((v, i) => v === values[i]);

  const doBulk = async () => {
    const action = pendingBulk;
    setPendingBulk(null);
    if (!action) return;
    setBulkBusy(true);
    try {
      const result = await api.post<WiperPageValues>(
        `/targets/${target.id}/wipers/${action === "save" ? "default" : "reset"}`,
        { page },
      );
      setValues(result.values);
      setDefaults(result.defaults ?? null);
      setDrafts(new Map());
      const summary = result.values.map((v, i) => `${page}${i + 1}=${v}`).join(" ");
      addAdminLog?.(
        action === "save"
          ? `SENSITIVITY DEFAULT: ${target.label} Calibration ${page} saved (${summary})`
          : `SENSITIVITY RESET: ${target.label} Calibration ${page} restored (${summary})`,
      );
      onNotice(
        action === "save"
          ? isAr ? "تم حفظ القيم كافتراضية" : "Saved as default"
          : isAr ? "تمت الاستعادة للقيم الافتراضية" : "Reset to default",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      onNotice(isAr ? `خطأ: ${msg}` : `Error: ${msg}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const commitKeys = ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
  const actionCls =
    "flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg admin-text-xs font-mono font-bold hud-btn-secondary cursor-pointer active:scale-[0.97] transition-transform duration-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div
          role="tablist"
          className="inline-flex p-0.5 rounded-lg bg-black/30 border border-hud/60"
        >
          {PAGES.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={page === p}
              onClick={() => setPage(p)}
              disabled={loading || bulkBusy}
              className={`px-3 py-1 rounded-md admin-text-xs font-mono font-bold cursor-pointer transition-colors duration-150 disabled:cursor-wait ${
                page === p
                  ? "hud-accent bg-[var(--hud-accent-bg-subtle)] shadow-sm"
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
          disabled={loading || bulkBusy}
          title={isAr ? "إعادة القراءة من الجهاز" : "Re-read from the board"}
          aria-label={isAr ? "تحديث" : "Refresh"}
          className="p-1.5 rounded-lg hud-text-subtle hover:hud-text hover:bg-hud-elevated cursor-pointer active:scale-[0.94] transition-transform duration-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {values === null && !loading ? (
        <div className="space-y-1 p-3 rounded-lg bg-[var(--hud-warning-bg)]">
          <p className="admin-text-xs font-mono text-amber-500">
            {isAr
              ? "تعذّرت قراءة الحساسية — تحقّق من أن الهدف متصل."
              : "Could not read sensitivity — check that the board is reachable."}
          </p>
          {readError && (
            <p className="admin-text-2xs font-mono text-amber-500/70 break-words">{readError}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: WIPER_COUNT }, (_v, i) => i).map((i) => {
            const busy = savingWiper === i || loading || bulkBusy || pendingCommit !== null;
            const val = displayed(i);
            const differs = defaults && values && defaults[i] !== val;
            return (
              <div key={i} className="grid grid-cols-[2rem_1fr_3.5rem] items-center gap-3">
                <span className="admin-text-xs font-mono font-bold hud-text-secondary">
                  {page}
                  {i + 1}
                </span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  value={val}
                  aria-label={`${page}${i + 1}`}
                  disabled={busy || values === null}
                  className="hud-form-range w-full"
                  onChange={(e) => setDrafts((prev) => new Map(prev).set(i, Number(e.target.value)))}
                  onPointerUp={(e) => void requestCommitWiper(i, Number((e.target as HTMLInputElement).value))}
                  onKeyUp={(e) => {
                    if (commitKeys.includes(e.key)) {
                      void requestCommitWiper(i, Number((e.target as HTMLInputElement).value));
                    }
                  }}
                />
                <div className="relative">
                  {savingWiper === i ? (
                    <div className="flex justify-center py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin hud-accent" />
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={val}
                      disabled={busy || values === null}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          new Map(prev).set(i, Math.max(0, Math.min(255, Number(e.target.value) || 0))),
                        )
                      }
                      onBlur={(e) => void requestCommitWiper(i, Number(e.target.value) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="w-full text-center admin-text-xs font-mono tabular-nums px-1 py-1 rounded-md border border-hud/40 bg-black/20 hover:border-hud focus:border-[var(--hud-accent-border)] outline-none transition-colors disabled:opacity-50"
                    />
                  )}
                  {differs && (
                    <span
                      title={isAr ? `الافتراضي ${defaults![i]}` : `Default ${defaults![i]}`}
                      className="absolute -top-1 -end-1 w-1.5 h-1.5 rounded-full bg-amber-500"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setPendingBulk("save")}
          disabled={loading || bulkBusy || values === null || atDefault}
          title={isAr ? "حفظ القيم الحالية كافتراضية لهذا الهدف" : "Save the current values as this target's default"}
          className={actionCls}
        >
          <Save className="w-3.5 h-3.5" />
          {isAr ? "حفظ كافتراضي" : "Save as default"}
        </button>
        <button
          type="button"
          onClick={() => setPendingBulk("reset")}
          disabled={loading || bulkBusy || !defaults || atDefault}
          title={defaults ? undefined : isAr ? "لا توجد قيم افتراضية محفوظة" : "No default saved yet"}
          className={actionCls}
        >
          {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          {isAr ? "استعادة" : "Reset"}
        </button>
      </div>

      {bulkBusy && (
        <p className="admin-text-2xs font-mono hud-accent">
          {isAr
            ? "جارٍ الكتابة إلى الجهاز — حوالي ١٠ ث لكل قيمة. الجهاز يتوقف عن الرد بعد كل كتابة، لذا يتم التأكد بإعادة القراءة. لا تغلق هذه اللوحة."
            : "Writing to the board — about 10s per value. The board goes silent after each write, so every value is confirmed by a re-read. Keep this panel open."}
        </p>
      )}

      <p className="admin-text-2xs font-mono hud-text-muted leading-relaxed">
        {defaults
          ? isAr
            ? `الافتراضي المحفوظ: ${defaults.join("، ")}${atDefault ? " — مطابق" : ""}`
            : `Saved default: ${defaults.join(", ")}${atDefault ? " — matches board" : ""}`
          : isAr
            ? "لا يوجد افتراضي محفوظ لهذه الصفحة بعد."
            : "No default saved for this page yet."}
      </p>

      <p className="admin-text-2xs font-mono hud-text-subtle leading-relaxed pt-3 border-t border-hud/40">
        {isAr
          ? "لا يوجد توثيق لربط الحساسات بالمقاومات. غيّر قيمة واحدة، أطلق طلقة، واقرأها على الوجه."
          : "Wiper→sensor mapping is undocumented. Change one value, fire a round, and read it back on the face."}
      </p>

      <ConfirmDialog
        open={pendingBulk !== null}
        title={
          pendingBulk === "save"
            ? isAr ? "حفظ كافتراضي" : "Save as Default"
            : isAr ? "استعادة الافتراضي" : "Reset to Default"
        }
        message={
          pendingBulk === "save"
            ? isAr
              ? `حفظ قيم المعايرة ${page} الحالية (${values?.join("، ")}) كافتراضية للهدف ${target.label}؟`
              : `Save the current Calibration ${page} values (${values?.join(", ")}) as ${target.label}'s default?`
            : isAr
              ? `إعادة المعايرة ${page} للهدف ${target.label} إلى (${defaults?.join("، ")})؟`
              : `Reset Calibration ${page} on ${target.label} to (${defaults?.join(", ")})?`
        }
        language={isAr ? "ar" : "en"}
        confirmLabel={pendingBulk === "save" ? (isAr ? "حفظ" : "Save") : (isAr ? "استعادة" : "Reset")}
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        variant="primary"
        onConfirm={() => void doBulk()}
        onCancel={() => setPendingBulk(null)}
      />

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
