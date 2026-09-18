import { useEffect, useState } from "react";
import { api } from "../../../../utils/api";
import type { Lane, Target } from "../../../../types";
import { TargetLiftSwitch } from "./TargetLiftSwitch";

interface Props {
  laneId: number;
  isAr: boolean;
  refreshKey?: number;
}

export function LaneTargetLifts({ laneId, isAr, refreshKey }: Props) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<Lane[]>("/lanes")
      .then((lanes) => {
        if (!alive) return;
        const lane = (Array.isArray(lanes) ? lanes : []).find(
          (l) => l.id === laneId,
        );
        setTargets(
          [...(lane?.targets ?? [])].sort(
            (a, b) => a.positionIndex - b.positionIndex,
          ),
        );
      })
      .catch(() => alive && setTargets([]));
    return () => {
      alive = false;
    };
  }, [laneId]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  if (targets.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-hud p-2.5">
      <p className="px-1.5 pb-1.5 admin-text-2xs font-semibold uppercase tracking-[0.14em] hud-text-muted">
        {isAr ? "الأهداف" : "Targets"}
      </p>
      <div className="flex flex-wrap gap-1">
        {targets.map((t) => (
          <div
            key={t.id}
            className="inline-flex items-center gap-1 rounded-xl bg-hud-elevated ps-3 pe-1"
          >
            <span className="admin-text-xs font-semibold hud-text">
              {t.label}
            </span>
            <TargetLiftSwitch
              targetId={t.id}
              isAr={isAr}
              onError={setError}
              refreshKey={refreshKey}
            />
          </div>
        ))}
      </div>
      {error && (
        <p className="px-1.5 pt-1.5 admin-text-2xs font-medium text-rose-500">
          {error}
        </p>
      )}
    </div>
  );
}
