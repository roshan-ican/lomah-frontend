import React, { useEffect, useRef, useState } from "react";
import { Target, Eye, EyeOff } from "lucide-react";
import { TranslationSet } from "../../../translations";
import type { DisplayShot } from "../../../types";
import { ShotDirectionArrow } from "./ShotDirectionArrow";

interface ShotHistoryProps {
  shots: DisplayShot[];
  selectedShotId: number | null;
  setSelectedShotId: (id: number | null) => void;
  language: "en" | "ar";
  t: TranslationSet;
  variant?: "default" | "hud" | "simulator";
  layout?: "vertical" | "horizontal";
  noScroll?: boolean;
  hideHeader?: boolean;
  compactRows?: boolean;
  size?: "default" | "distance";
  hideTimestamp?: boolean;
}

function compactTime(timestamp: string): string {
  const match = timestamp.match(/(\d{1,2}:\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (match) return match[1];
  return timestamp.slice(0, 5);
}

export const ShotHistory: React.FC<ShotHistoryProps> = ({
  shots,
  selectedShotId,
  setSelectedShotId,
  language,
  t,
  variant = "default",
  layout = "vertical",
  noScroll = false,
  hideHeader = false,
  compactRows = false,
  size = "default",
  hideTimestamp = false,
}) => {
  const isAr = language === "ar";
  const isHud = variant === "hud";
  const isDistance = size === "distance";
  const isSimulator = variant === "simulator";
  const isHorizontal = layout === "horizontal";
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [hidePreCalibration, setHidePreCalibration] = useState(false);
  const hasCalibrationMarker = shots.some((sh) => sh.isCalibrationMarker);
  const visibleShots = shots.filter((sh) => sh.isCalibrationMarker || !(sh.isMiss ?? false));
  // Counts and "newest shot" describe bullets, so divider rows are excluded —
  // a marker's id is deliberately half-way past the last shot, so leaving it in
  // made it win Math.max and stole the newest-shot highlight.
  const realVisibleShots = visibleShots.filter((sh) => !sh.isCalibrationMarker);
  const newestId =
    realVisibleShots.length > 0
      ? Math.max(...realVisibleShots.map((s) => s.id))
      : null;
  const sortedShots = [...visibleShots].sort((a, b) => a.id - b.id);
  // Anchor on the LATEST calibration, not the earliest: with more than one
  // calibration in a session, keying off the first marker left every shot from
  // the older calibrations still on screen.
  const orderedShots =
    hidePreCalibration && hasCalibrationMarker
      ? (() => {
          const lastMarkerIdx = sortedShots.reduce(
            (acc, sh, i) => (sh.isCalibrationMarker ? i : acc),
            -1,
          );
          return sortedShots.filter((_, i) => i >= lastMarkerIdx);
        })()
      : sortedShots;

  useEffect(() => {
    if (noScroll || selectedShotId == null) return;
    const row = rowRefs.current.get(selectedShotId);
    row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedShotId, noScroll]);

  if ((isHud || isSimulator) && isHorizontal) {
    const chipClass = (isSelected: boolean) =>
      isSelected
        ? isSimulator
          ? "border-[var(--sim-accent)] bg-[var(--sim-accent-soft)] text-[var(--sim-text)] shadow-[var(--sim-shadow)]"
          : "border-[var(--hud-accent)] bg-[var(--hud-accent-bg-subtle)] hud-text shadow-[0_0_16px_rgba(13,148,136,0.12)]"
        : isSimulator
          ? "border-transparent text-[var(--sim-muted)] hover:text-[var(--sim-text)] hover:bg-[var(--sim-accent-soft)]"
          : "border-transparent hud-text-secondary hover:hud-text hover:bg-[var(--hud-accent-bg-subtle)]";

    const chipSize = noScroll ? "px-2 py-1.5" : "px-4 py-2.5";

    return (
      <div>
        {hasCalibrationMarker && (
          <div className="flex items-center justify-end mb-1">
            <button
              type="button"
              onClick={() => setHidePreCalibration((v) => !v)}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${isSimulator ? "text-[var(--sim-accent)] hover:bg-[var(--sim-accent-soft)]" : "text-[var(--hud-accent)] hover:bg-[var(--hud-accent-bg-subtle)]"}`}
            >
              {hidePreCalibration ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {isAr ? (hidePreCalibration ? "إظهار الكل" : "إخفاء ما قبل المعايرة") : (hidePreCalibration ? "Show all" : "Hide pre-cal")}
            </button>
          </div>
        )}
        <div
          className={
            noScroll
              ? "flex flex-wrap gap-1 content-start"
              : "flex gap-2 overflow-x-auto pb-1"
          }
        >
        {orderedShots.length === 0 ? (
          <span
            className={`py-2 ${isSimulator ? "sim-label" : "hud-label hud-text-subtle"}`}
          >
            {isAr ? "لا توجد طلقات بعد" : "No shots yet"}
          </span>
        ) : (
          orderedShots.map((sh) => {
            if (sh.isCalibrationMarker) {
              return (
                <div
                  key={sh.id}
                  className="shrink-0 flex flex-col items-center gap-0.5 px-1"
                >
                  <div className={`w-px h-8 ${isSimulator ? "bg-[var(--sim-accent)]" : "bg-[var(--hud-accent)]"} opacity-60`} />
                  <span className={`text-[8px] leading-none ${isSimulator ? "text-[var(--sim-accent)]" : "text-[var(--hud-accent)]"} opacity-70 whitespace-nowrap`}>
                    {isAr ? "المعايرة" : "CAL"}
                  </span>
                  <div className={`w-px h-8 ${isSimulator ? "bg-[var(--sim-accent)]" : "bg-[var(--hud-accent)]"} opacity-60`} />
                </div>
              );
            }
            const isSelected = selectedShotId === sh.id;
            const chip = chipClass(isSelected);

            return (
              <button
                key={sh.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(sh.id, el);
                  else rowRefs.current.delete(sh.id);
                }}
                onClick={() => setSelectedShotId(sh.id)}
                className={`shrink-0 flex flex-col items-center gap-0.5 ${chipSize} font-mono transition-all cursor-pointer rounded-lg border ${chip}`}
              >
                <span
                  className={`${noScroll ? "text-[10px]" : "text-xs"} ${isSelected ? (isSimulator ? "sim-accent font-bold" : "hud-accent font-bold") : ""}`}
                >
                  #{sh.id}
                </span>
                <ShotDirectionArrow
                  x={sh.x}
                  y={sh.y}
                  size={noScroll ? 12 : 16}
                  language={language}
                  className={
                    isSelected
                      ? isSimulator
                        ? "text-[var(--sim-accent)]"
                        : "text-[var(--hud-accent)]"
                      : isSimulator
                        ? "text-[var(--sim-muted)]"
                        : "hud-text-subtle"
                  }
                />
                <span
                  className={`text-sm font-bold tabular-nums ${
                    sh.score >= 9
                      ? isSimulator
                        ? "text-[var(--sim-accent)]"
                        : "text-[var(--hud-accent)]"
                      : sh.score === 0
                        ? "hud-danger"
                        : isSimulator
                          ? "text-[var(--sim-warm)]"
                          : "hud-warning"
                  }`}
                >
                  {sh.score}
                </span>
              </button>
            );
          })
        )}
      </div>
      </div>
    );
  }

  if (isHud) {
    const rowList = (
      <div
        className={
          hideHeader
            ? "h-full min-h-0 overflow-y-auto space-y-px"
            : "space-y-0.5 max-h-[220px] overflow-y-auto"
        }
      >
        {orderedShots.length === 0 ? (
          <p
            className={`text-center hud-text-secondary normal-case ${
              isDistance
                ? "range-display-label text-base py-8"
                : `range-rail-label hud-text-subtle normal-case tracking-normal ${
                    hideHeader ? "py-4" : "py-8"
                  }`
            }`}
          >
            {isAr ? "لا توجد طلقات مسجلة بعد" : "No shots yet"}
          </p>
        ) : (
          orderedShots.map((sh) => {
            if (sh.isCalibrationMarker) {
              return (
                <div
                  key={sh.id}
                  className="w-full flex items-center gap-3 px-2 py-2"
                >
                  <div className="flex-1 h-px bg-[var(--hud-accent)] opacity-40" />
                  <span className="text-xs font-mono uppercase tracking-widest text-[var(--hud-accent)] opacity-70 shrink-0">
                    {isAr ? "تمت المعايرة" : "Calibration Applied"}
                  </span>
                  <div className="flex-1 h-px bg-[var(--hud-accent)] opacity-40" />
                </div>
              );
            }
            const isSelected = selectedShotId === sh.id;

            return (
              <button
                key={sh.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(sh.id, el);
                  else rowRefs.current.delete(sh.id);
                }}
                onClick={() => setSelectedShotId(sh.id)}
                className={`w-full flex items-center transition-all cursor-pointer border-l-4 ${
                  isDistance
                    ? "shooter-shot-row gap-4 px-3 py-3.5"
                    : compactRows
                      ? "range-rail-meta px-2.5 py-2 gap-2"
                      : "px-2 py-2 text-sm font-mono gap-4"
                } ${
                  isSelected ? "hud-shot-row--selected" : "hud-shot-row--idle"
                }`}
              >
                <span
                  className={`tabular-nums shrink-0 hud-text-strong ${
                    isDistance
                      ? "min-w-[2.5rem] text-left"
                      : compactRows
                        ? "w-7 range-rail-stat !text-[inherit]"
                        : "w-8"
                  } ${isSelected ? "hud-accent" : ""}`}
                >
                  {sh.id}
                </span>
                <ShotDirectionArrow
                  x={sh.x}
                  y={sh.y}
                  size={isDistance ? 26 : compactRows ? 14 : 18}
                  language={language}
                  className={
                    isSelected ? "text-[var(--hud-accent)]" : "hud-text-muted"
                  }
                />
                <span
                  className={`tabular-nums shrink-0 font-bold ${
                    isDistance
                      ? "shooter-shot-score ml-auto"
                      : compactRows
                        ? "w-6 range-rail-stat"
                        : "w-8 text-right"
                  } ${
                    sh.score >= 9
                      ? "hud-accent"
                      : sh.score === 0
                        ? "hud-danger"
                        : "hud-timer"
                  }`}
                >
                  {Math.round(sh.score)}
                </span>
                {!hideTimestamp && !isDistance && (
                  <span
                    className={`ml-auto tabular-nums shrink-0 ${
                      compactRows
                        ? "range-rail-label hud-text-subtle normal-case tracking-normal"
                        : "text-xs hud-text-subtle"
                    }`}
                  >
                    {compactTime(sh.timestamp)}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    );

    if (hideHeader) {
      return <div className="h-full min-h-0 flex flex-col">{rowList}</div>;
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="hud-label hud-text-secondary">
            {isAr ? "الطلقات الأخيرة" : "RECENT SHOTS"}
          </span>
          <div className="flex items-center gap-2">
            {hasCalibrationMarker && (
              <button
                type="button"
                onClick={() => setHidePreCalibration((v) => !v)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-[var(--hud-accent)] hover:bg-[var(--hud-accent-bg-subtle)]"
              >
                {hidePreCalibration ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {isAr ? (hidePreCalibration ? "إظهار الكل" : "إخفاء ما قبل المعايرة") : (hidePreCalibration ? "Show all" : "Hide pre-cal")}
              </button>
            )}
            <span className="hud-label hud-accent">
              {realVisibleShots.length} {isAr ? "إجمالي" : "total"}
            </span>
          </div>
        </div>
        {rowList}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1C1F26] p-4 rounded-xl border border-gray-200 dark:border-glass-border shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-glass-border pb-3 mb-3">
        <h3 className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-1.5 select-none">
          <Target className="w-4 h-4 text-emerald-500" />
          {t.shotLog}
        </h3>
        <div className="flex items-center gap-2">
          {hasCalibrationMarker && (
            <button
              type="button"
              onClick={() => setHidePreCalibration((v) => !v)}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-emerald-500 hover:bg-emerald-500/10"
            >
              {hidePreCalibration ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {isAr ? (hidePreCalibration ? "إظهار الكل" : "إخفاء ما قبل المعايرة") : (hidePreCalibration ? "Show all" : "Hide pre-cal")}
            </button>
          )}
          <span className="font-mono text-xs bg-gray-100 dark:bg-[#121417] px-2 py-0.5 rounded text-gray-400">
            {realVisibleShots.length} {isAr ? "إطلاقات" : "Total"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 max-h-[380px] pr-1">
        {realVisibleShots.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-on-surface-variant/45 font-mono text-xs">
            {isAr ? "لا توجد طلقات مسجلة بعد" : "No shots detected on matrix."}
          </div>
        ) : (
          visibleShots.map((sh) => {
            if (sh.isCalibrationMarker) {
              return (
                <div
                  key={sh.id}
                  className="w-full flex items-center gap-3 py-2"
                >
                  <div className="flex-1 h-px bg-emerald-500 opacity-30" />
                  <span className="text-xs font-mono uppercase tracking-widest text-emerald-500 opacity-70 shrink-0">
                    {isAr ? "تمت المعايرة" : "Calibration Applied"}
                  </span>
                  <div className="flex-1 h-px bg-emerald-500 opacity-30" />
                </div>
              );
            }
            const isSelected = selectedShotId === sh.id;

            return (
              <button
                key={sh.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(sh.id, el);
                  else rowRefs.current.delete(sh.id);
                }}
                onClick={() => setSelectedShotId(sh.id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-bold"
                    : "bg-transparent border-gray-200 dark:border-glass-border text-gray-700 dark:text-[#e2e2e6] hover:bg-gray-50 dark:hover:bg-[#20242D]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                      isSelected
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-100 dark:bg-[#121417] text-gray-400"
                    }`}
                  >
                    {sh.id}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-mono font-bold block">
                      {isAr ? "طلقة" : "Shot"} #{sh.id}
                    </span>
                    <span className="block font-mono text-xs text-gray-400 mt-0.5">
                      {sh.timestamp}
                    </span>
                    <span className="block font-mono text-[9px] text-gray-400 mt-0.5">
                      x:{sh.x}mm y:{sh.y}mm
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <ShotDirectionArrow
                    x={sh.x}
                    y={sh.y}
                    language={language}
                    className={
                      isSelected ? "text-emerald-500 dark:text-emerald-400" : ""
                    }
                  />
                  <span
                    className={`font-mono text-sm font-bold tabular-nums min-w-[2ch] text-right ${
                      sh.score >= 9.0
                        ? "text-emerald-500"
                        : sh.score === 0
                          ? "text-rose-500"
                          : "text-orange-400"
                    }`}
                  >
                    {sh.score}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
