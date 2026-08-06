import { useEffect, useState } from "react";
import { Radio, Loader2 } from "lucide-react";

import { api } from "../../../../utils/api";
import type { TargetDevDataResult } from "@shared/types/lane";

/**
 * The 'D' diagnostic for one shot: which of the board's 8 sensors detected it.
 *
 * The bitmask the board returns is documented in TargetDevDataResult as
 * L4 L3 L2 L1 R4 R3 R2 R1 with bit 0 = R1, so index 0 of this array is bit 0.
 * Rendered in that same wire order rather than sorted L-then-R, so a value
 * read off this panel can be compared against the raw rxHex byte directly.
 */
const SENSOR_LABELS = ["R1", "R2", "R3", "R4", "L1", "L2", "L3", "L4"] as const;

interface ShotSensorDiagnosticProps {
  /** The board that reported this shot. Null disables the query — see the
   *  targetId comment on DisplayShot for why it is per-shot. */
  targetId: string | null;
  /** Shot number as the board counts them, i.e. DisplayShot.id. */
  shotNumber: number | null;
  isAr: boolean;
}

export function ShotSensorDiagnostic({
  targetId,
  shotNumber,
  isAr,
}: ShotSensorDiagnosticProps) {
  const [result, setResult] = useState<TargetDevDataResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear on shot change: showing shot #3's sensors under a "#4" heading while
  // the new query is in flight is worse than showing nothing.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [targetId, shotNumber]);

  const query = async () => {
    if (!targetId || shotNumber == null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<TargetDevDataResult>(
        `/targets/${targetId}/dev-data`,
        { shot: shotNumber },
      );
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
            ? "فشل الاستعلام"
            : "Query failed",
      );
    } finally {
      setLoading(false);
    }
  };

  if (shotNumber == null) return null;

  const disabled = !targetId || loading;

  return (
    <div className="border-t border-hud/40 pt-1.5 mt-1.5 space-y-1.5">
      <button
        type="button"
        onClick={() => void query()}
        disabled={disabled}
        className="flex items-center gap-1.5 admin-text-3xs font-mono uppercase tracking-wider
                   px-2 py-1 rounded border border-hud bg-hud-elevated
                   hover:bg-hud disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Radio className="w-3 h-3" />
        )}
        {isAr
          ? `استعلام المستشعرات (D) #${shotNumber}`
          : `Query sensors (D) — shot #${shotNumber}`}
      </button>

      {!targetId && (
        <p className="admin-text-3xs font-mono hud-text-muted italic">
          {isAr
            ? "لا يوجد هدف معروف لهذه الطلقة"
            : "No target recorded for this shot — cannot query."}
        </p>
      )}

      {error && (
        <p className="admin-text-3xs font-mono text-amber-500">{error}</p>
      )}

      {result && (
        <div className="space-y-1">
          {/* sensors === null means the board never answered at all, which is a
              different failure from "answered, detected nothing" (0x00). */}
          {result.sensors === null ? (
            <p className="admin-text-3xs font-mono text-amber-500">
              {result.message}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {SENSOR_LABELS.map((label, bit) => {
                  const hit = (result.sensors! & (1 << bit)) !== 0;
                  return (
                    <span
                      key={label}
                      className={`admin-text-3xs font-mono px-1.5 py-0.5 rounded border ${
                        hit
                          ? "border-emerald-500 text-emerald-500 bg-emerald-500/10"
                          : "border-hud hud-text-muted opacity-50"
                      }`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
              <p className="admin-text-3xs font-mono hud-text-subtle">
                0x{result.sensors.toString(16).toUpperCase().padStart(2, "0")} —{" "}
                {countBits(result.sensors)}/8{" "}
                {isAr ? "استشعرت" : "detected"}
              </p>
              {result.sensors === 0 && (
                <p className="admin-text-3xs font-mono text-amber-500">
                  {isAr
                    ? "لم يستشعر أي مستشعر هذه الطلقة — تحقق من الحساسية."
                    : "No sensor detected this shot — check sensitivity trim."}
                </p>
              )}
            </>
          )}
          {result.rxHex && (
            <p className="admin-text-3xs font-mono hud-text-muted break-all">
              RX {result.rxHex}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function countBits(mask: number): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) n++;
  return n;
}
