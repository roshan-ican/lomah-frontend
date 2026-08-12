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

/** Both pairs are whole millimetres end to end — the sensor reports integers
 *  and the offsets are integer columns — so there is nothing here to round. */
const coordText = (x: number, y: number) => `X:${x}mm Y:${y}mm`;

/**
 * The row is one dense line of numbers, so the three labels carry the weight
 * rather than a larger size — bolding X, Y and SENSOR gives the eye somewhere
 * to land without making the row any taller.
 */
const LABEL_WEIGHT = "font-bold";

/** The sensor pair rides on the same line as everything else, so it drops the
 *  axis letters and the units the scored pair beside it has already stated. */
const sensorText = (x: number, y: number) => `${x}, ${y}`;

/**
 * The board's own reading for this shot, or null if there is nothing worth
 * showing.
 *
 * Null in two cases, both of which mean "print the scored pair alone": the
 * shot predates the column (older sessions never recorded it), or calibration
 * did not move this shot at all, in which case repeating the same numbers
 * would only teach the operator to ignore them.
 */
function sensorCoords(sh: DisplayShot): { x: number; y: number } | null {
  if (sh.sensorX == null || sh.sensorY == null) return null;
  const moved = sh.sensorX !== sh.x || sh.sensorY !== sh.y;
  return moved ? { x: sh.sensorX, y: sh.sensorY } : null;
}

/**
 * Short and long labels for a round with no impact position.
 *
 * MISS and LOST are kept apart everywhere they surface because they send the
 * operator to different places: MISS is the board reporting it could not
 * triangulate a bullet it definitely saw, LOST is a frame that never reached
 * the server at all. A screen full of one means check the sensor; a screen full
 * of the other means check the link.
 */
function missLabel(
  sh: DisplayShot,
  isAr: boolean,
): { short: string; detail: string } {
  if (sh.isLost) {
    return {
      short: isAr ? "مفقودة" : "LOST",
      detail: isAr ? "لم تصل الإشارة" : "no signal",
    };
  }
  return {
    short: isAr ? "إخفاق" : "MISS",
    detail: isAr ? "لا يوجد كشف" : "no detection",
  };
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
  const [hideMisses, setHideMisses] = useState(false);
  const hasCalibrationMarker = shots.some((sh) => sh.isCalibrationMarker);
  const hasMisses = shots.some((sh) => sh.isMiss ?? false);
  const visibleShots = shots.filter(
    (sh) =>
      sh.isCalibrationMarker || !hideMisses || !(sh.isMiss ?? false),
  );
 
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

  /** Opt-out for anyone who wants the hits-only view the log used to force. */
  const missToggle = (className: string) =>
    hasMisses ? (
      <button type="button" onClick={() => setHideMisses((v) => !v)} className={className}>
        {hideMisses ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        {isAr
          ? hideMisses
            ? "إظهار الإخفاقات"
            : "إخفاء الإخفاقات"
          : hideMisses
            ? "Show misses"
            : "Hide misses"}
      </button>
    ) : null;

  /**
   * The scored position, followed by the board's own reading when the two
   * differ — both on the row's single line, alongside the arrow and score.
   *
   * Order is deliberate: the calibrated pair reads first and at full contrast,
   * because that is the one the score and the plotted hole come from. The
   * sensor pair is dimmer and labelled, so it can never be mistaken for the
   * position the shot was judged on.
   */
  const coordBlock = (
    sh: DisplayShot,
    cls: { primary: string; secondary: string },
  ) => {
    const s = sensorCoords(sh);
    return (
      <>
        {/* Split so the axis letters can carry the weight while the numbers
            stay regular — bolding the whole string would just make the row
            heavier without making it any easier to scan. */}
        <span className={cls.primary}>
          <span className={LABEL_WEIGHT}>X:</span>
          {sh.x}mm <span className={LABEL_WEIGHT}>Y:</span>
          {sh.y}mm
        </span>
        {s && (
          <span className={cls.secondary}>
            <span className={LABEL_WEIGHT}>
              {isAr ? "مستشعر" : "SENSOR"}
            </span>{" "}
            {sensorText(s.x, s.y)}
          </span>
        )}
      </>
    );
  };

  /**
   * Tapping the selected shot again clears the selection.
   *
   * Selection is a spotlight, not a cursor: it dims every other shot on the
   * board and pins a highlight ring on this one. Without a way out, the only
   * way back to the whole group was to pick some other shot — which is not the
   * same thing, and left the operator unable to see the plot unannotated.
   * `setSelectedShotId` has always accepted null; nothing was calling it.
   */
  const toggleShot = (id: number) =>
    setSelectedShotId(selectedShotId === id ? null : id);

  /** Same two facts as coordBlock, flattened for a title attribute. */
  const chipTitle = (sh: DisplayShot) => {
    const s = sensorCoords(sh);
    const scored = coordText(sh.x, sh.y);
    if (!s) return scored;
    return `${scored} · ${isAr ? "مستشعر" : "SENSOR"} ${sensorText(s.x, s.y)}`;
  };

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
        {(hasCalibrationMarker || hasMisses) && (
          <div className="flex items-center justify-end gap-1 mb-1">
            {hasCalibrationMarker && (
              <button
                type="button"
                onClick={() => setHidePreCalibration((v) => !v)}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${isSimulator ? "text-[var(--sim-accent)] hover:bg-[var(--sim-accent-soft)]" : "text-[var(--hud-accent)] hover:bg-[var(--hud-accent-bg-subtle)]"}`}
              >
                {hidePreCalibration ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {isAr ? (hidePreCalibration ? "إظهار الكل" : "إخفاء ما قبل المعايرة") : (hidePreCalibration ? "Show all" : "Hide pre-cal")}
              </button>
            )}
            {missToggle(
              `flex items-center gap-1 text-xs px-2 py-0.5 rounded ${isSimulator ? "text-[var(--sim-muted)] hover:bg-[var(--sim-accent-soft)]" : "hud-text-subtle hover:bg-[var(--hud-accent-bg-subtle)]"}`,
            )}
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

            if (sh.isMiss) {
              const { short } = missLabel(sh, isAr);
              return (
                <div
                  key={sh.id}
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 ${chipSize} font-mono rounded-lg border border-dashed ${
                    isSimulator
                      ? "border-[var(--sim-muted)] text-[var(--sim-muted)]"
                      : "border-[var(--hud-text-subtle,#6B7280)] hud-text-subtle"
                  } opacity-70`}
                >
                  <span className={noScroll ? "text-[10px]" : "text-xs"}>
                    #{sh.id}
                  </span>
                  <span className="text-[9px] font-bold tracking-wider">
                    {short}
                  </span>
                </div>
              );
            }

            return (
              <button
                key={sh.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(sh.id, el);
                  else rowRefs.current.delete(sh.id);
                }}
                onClick={() => toggleShot(sh.id)}
                // A tooltip rather than a third line of text: the chip strip is
                // a scannable summary and already carries number, direction and
                // score in the width of a thumb. Millimetres belong to whoever
                // stops to ask for them.
                title={chipTitle(sh)}
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
    /**
     * Shared column widths, so a MISS row and a hit row line up.
     *
     * They did not. A hit put a bare 18px arrow in the second slot while a miss
     * put the word MISS there — roughly 38px — so every column after it started
     * at a different x on the two kinds of row, and the log read as two
     * interleaved tables. Fixing the slot to one width means the arrow and the
     * label occupy the same box, and everything downstream inherits the
     * alignment instead of each row negotiating its own.
     *
     * Sized for the LABEL, not the arrow: the label is the wider of the two,
     * and Arabic "مفقودة" is wider still than "LOST".
     */
    const markSlot = compactRows ? "w-9" : "w-12";
    const scoreSlot = isDistance
      ? "shooter-shot-score ml-auto"
      : compactRows
        ? "w-6 range-rail-stat"
        : "w-8 text-right";

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

            if (sh.isMiss) {
              const { short, detail } = missLabel(sh, isAr);
              return (
                <div
                  key={sh.id}
                  className={`w-full flex items-center border-l-4 border-l-transparent hud-shot-row--idle opacity-60 ${
                    isDistance
                      ? "shooter-shot-row gap-4 px-3 py-3.5"
                      : compactRows
                        ? "range-rail-meta px-2.5 py-2 gap-2"
                        : "px-2 py-2 text-sm font-mono gap-4"
                  }`}
                >
                  <span
                    className={`tabular-nums shrink-0 hud-text-subtle ${
                      isDistance
                        ? "min-w-[2.5rem] text-left"
                        : compactRows
                          ? "w-7 range-rail-stat !text-[inherit]"
                          : "w-8"
                    }`}
                  >
                    {sh.id}
                  </span>
                  {/* Same box the arrow occupies on a hit row. */}
                  <span
                    className={`${markSlot} shrink-0 font-mono tracking-wider hud-text-subtle font-bold ${
                      compactRows ? "text-[10px]" : "text-xs"
                    }`}
                  >
                    {short}
                  </span>
                  {/* Gated identically to the hit row's coordinates, so the
                      third column either exists on both or on neither. */}
                  {!compactRows && !isDistance && (
                    <span className="flex items-baseline min-w-0 text-left whitespace-nowrap font-mono text-[10px] hud-text-subtle normal-case">
                      {detail}
                    </span>
                  )}
                  {/* A held place, not a score. Without it the score column
                      simply vanishes on miss rows and the eye loses the
                      column edge it was tracking down the list. */}
                  <span
                    className={`tabular-nums shrink-0 font-bold hud-text-subtle ${scoreSlot}`}
                  >
                    —
                  </span>
                  {!hideTimestamp && !isDistance && (
                    <span className="ml-auto tabular-nums shrink-0 text-xs hud-text-subtle">
                      {compactTime(sh.timestamp)}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <button
                key={sh.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(sh.id, el);
                  else rowRefs.current.delete(sh.id);
                }}
                onClick={() => toggleShot(sh.id)}
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
                {/* Boxed to markSlot so the arrow and a MISS label start and
                    end at the same x — see markSlot above. */}
                <span
                  className={`${markSlot} shrink-0 flex items-center justify-start`}
                >
                  <ShotDirectionArrow
                    x={sh.x}
                    y={sh.y}
                    size={isDistance ? 26 : compactRows ? 14 : 18}
                    language={language}
                    className={
                      isSelected ? "text-[var(--hud-accent)]" : "hud-text-muted"
                    }
                  />
                </span>
                {/* Skipped on the compact rail and the distance layout: both
                    are sized for a glance from the firing point, and neither
                    has the width for two lines of millimetres. */}
                {!compactRows && !isDistance && (
                  <span className="flex items-baseline gap-2 min-w-0 text-left whitespace-nowrap">
                    {coordBlock(sh, {
                      primary:
                        "font-mono text-[10px] hud-text-muted tabular-nums",
                      secondary:
                        "font-mono text-[9px] hud-text-subtle tabular-nums",
                    })}
                  </span>
                )}
                <span
                  className={`tabular-nums shrink-0 font-bold ${scoreSlot} ${
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
            {missToggle(
              "flex items-center gap-1 text-xs px-2 py-0.5 rounded hud-text-subtle hover:bg-[var(--hud-accent-bg-subtle)]",
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
          {missToggle(
            "flex items-center gap-1 text-xs px-2 py-0.5 rounded text-gray-400 hover:bg-gray-500/10",
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

            if (sh.isMiss) {
              const { short, detail } = missLabel(sh, isAr);
              return (
                <div
                  key={sh.id}
                  className="w-full text-left p-2.5 rounded-lg border border-dashed border-gray-200 dark:border-glass-border flex items-center justify-between gap-2 opacity-70"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 bg-gray-100 dark:bg-[#121417] text-gray-400">
                      {sh.id}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-mono font-bold block text-gray-500 dark:text-gray-400">
                        {isAr ? "طلقة" : "Shot"} #{sh.id}
                      </span>
                      <span className="block font-mono text-xs text-gray-400 mt-0.5">
                        {sh.timestamp}
                      </span>
                      {/* Deliberately no x/y line: both are zero, and printing
                          "x:0mm y:0mm" reads as a dead-centre hit. */}
                      <span className="block font-mono text-[9px] text-gray-400 mt-0.5">
                        {detail}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold tracking-wider text-gray-400 shrink-0">
                    {short}
                  </span>
                </div>
              );
            }

            return (
              <button
                key={sh.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(sh.id, el);
                  else rowRefs.current.delete(sh.id);
                }}
                onClick={() => toggleShot(sh.id)}
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
                    <span className="flex items-baseline gap-2 mt-0.5 whitespace-nowrap">
                      {coordBlock(sh, {
                        primary: "font-mono text-[9px] text-gray-400",
                        secondary: "font-mono text-[9px] text-gray-400/60",
                      })}
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
