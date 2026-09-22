import React, { useEffect, useState } from "react";
import { Info } from "lucide-react";
import {
  ACTION_LABELS,
  RULE_ACTIONS,
  RULE_ZONES,
  STAGE_PRESETS,
  ZONE_LABELS,
  expandUpDurations,
  timelineError,
  type RuleAction,
  type RuleZone,
  type StageMode,
  type StageModeConfig,
  type StageRule,
  type TimelineConfig,
} from "../../../utils/stageMode";

const DEFAULT_TIMELINE: TimelineConfig = { repeat: 5, upForMs: [3000], downForMs: 2000 };
const DEFAULT_RULE: StageRule = { when: "hits", count: 3, then: "DROP_AND_HOLD" };

type Choice = "STATIC" | "PEEKABOO" | "DROP_AFTER_N" | "SNAP" | "CUSTOM_TIMELINE" | "CUSTOM_REACTIVE";

function currentChoice(mode: StageMode, config: StageModeConfig): Choice {
  if (mode === "STATIC") return "STATIC";
  if (config.preset && config.preset !== "CUSTOM") return config.preset;
  return mode === "REACTIVE" ? "CUSTOM_REACTIVE" : "CUSTOM_TIMELINE";
}

const labelCls = "block hud-text-subtle mb-1 font-mono uppercase admin-text-2xs";
const inputCls = "w-full px-1.5 py-1.5 border rounded text-center hud-form-input";

export const StageBehaviour: React.FC<{
  mode: StageMode;
  config: StageModeConfig;
  isAr: boolean;
  onChange: (mode: StageMode, config: StageModeConfig) => void;
}> = ({ mode, config, isAr, onChange }) => {
  const [showGuide, setShowGuide] = useState(false);
  const [upText, setUpText] = useState("");
  const timeline = config.timeline;
  const rule = config.rules?.[0];

  useEffect(() => {
    if (!timeline) return;
    const fromConfig = timeline.upForMs.map((ms) => ms / 1000).join(", ");
    const parsed = upText.split(",").map((v) => Math.round(Number(v.trim()) * 1000));
    if (parsed.join() !== timeline.upForMs.join()) setUpText(fromConfig);
  }, [timeline]);

  const choose = (choice: Choice) => {
    if (choice === "STATIC") return onChange("STATIC", {});
    if (choice === "CUSTOM_TIMELINE") {
      return onChange("TIMELINE", { preset: "CUSTOM", timeline: timeline ?? DEFAULT_TIMELINE });
    }
    if (choice === "CUSTOM_REACTIVE") {
      return onChange("REACTIVE", { preset: "CUSTOM", rules: [rule ?? DEFAULT_RULE] });
    }
    const preset = STAGE_PRESETS.find((p) => p.id === choice)!;
    onChange(preset.mode, { preset: preset.id, ...structuredClone(preset.config) });
  };

  const patchTimeline = (patch: Partial<TimelineConfig>) =>
    onChange(mode, { ...config, preset: "CUSTOM", timeline: { ...timeline!, ...patch } });

  const patchRule = (patch: Partial<StageRule>) =>
    onChange(mode, { ...config, preset: "CUSTOM", rules: [{ ...rule!, ...patch }] });

  const preset = STAGE_PRESETS.find((p) => p.id === config.preset);
  const error = timeline ? timelineError(timeline, isAr) : null;
  const expanded = timeline ? expandUpDurations(timeline) : [];

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center justify-between">
          <label className={labelCls}>{isAr ? "سلوك الهدف" : "Behaviour"}</label>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            title={isAr ? "دليل التمارين" : "Drill guide"}
            className="p-0.5 mb-1 hud-text-subtle hover:hud-accent cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
        <select
          value={currentChoice(mode, config)}
          onChange={(e) => choose(e.target.value as Choice)}
          className="w-full px-2 py-1.5 rounded admin-text-2xs font-mono border hud-form-input cursor-pointer"
        >
          <option value="STATIC">{isAr ? "ثابت (قائم طوال المرحلة)" : "Static (up for the whole stage)"}</option>
          {STAGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {isAr ? p.label.ar : p.label.en}
            </option>
          ))}
          <option value="CUSTOM_TIMELINE">{isAr ? "مخصص — ظهور بالتوقيت" : "Custom — timed exposures"}</option>
          <option value="CUSTOM_REACTIVE">{isAr ? "مخصص — يتفاعل مع الإصابات" : "Custom — reacts to hits"}</option>
        </select>
        {preset && (
          <p className="admin-text-2xs font-mono hud-text-muted mt-1">
            {isAr ? preset.guide.ar : preset.guide.en}
          </p>
        )}
      </div>

      {showGuide && (
        <div className="p-2 rounded border border-hud bg-hud-elevated space-y-1.5">
          <p className="admin-text-2xs font-mono font-bold hud-accent uppercase">
            {isAr ? "دليل التمارين" : "Drill guide"}
          </p>
          {STAGE_PRESETS.map((p) => (
            <p key={p.id} className="admin-text-2xs font-mono hud-text-muted leading-snug">
              <span className="hud-text-secondary font-bold">{isAr ? p.label.ar : p.label.en}</span>
              {" — "}
              {isAr ? p.guide.ar : p.guide.en}{" "}
              <span className="italic">({isAr ? p.trains.ar : p.trains.en})</span>
            </p>
          ))}
          <p className="admin-text-2xs font-mono hud-text-muted leading-snug">
            <span className="hud-text-secondary font-bold">{isAr ? "مخصص" : "Custom"}</span>
            {" — "}
            {isAr ? "حدد كل القيم بنفسك." : "Set every value yourself."}
          </p>
        </div>
      )}

      {timeline && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>{isAr ? "مرات الظهور" : "Exposures"}</label>
            <input
              type="number"
              min={1}
              max={50}
              value={timeline.repeat}
              onChange={(e) => patchTimeline({ repeat: Math.max(1, Math.min(50, Number(e.target.value))) })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{isAr ? "ظهور (ث)" : "Up (s)"}</label>
            <input
              type="text"
              value={upText}
              placeholder="3 or 1,3,5"
              onChange={(e) => {
                setUpText(e.target.value);
                const ms = e.target.value
                  .split(",")
                  .map((v) => Math.round(Number(v.trim()) * 1000))
                  .filter((v) => Number.isFinite(v) && v > 0);
                if (ms.length) patchTimeline({ upForMs: ms });
              }}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{isAr ? "اختفاء (ث)" : "Down (s)"}</label>
            <input
              type="number"
              min={1}
              step={0.5}
              value={timeline.downForMs / 1000}
              onChange={(e) => patchTimeline({ downForMs: Math.round(Number(e.target.value) * 1000) })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {timeline && timeline.upForMs.length > 1 && (
        <p className="admin-text-2xs font-mono hud-text-muted">
          {isAr ? "التسلسل: " : "Sequence: "}
          {expanded.map((ms) => ms / 1000).join(", ")}
          {isAr ? " ث" : "s"}
        </p>
      )}

      {rule && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>{isAr ? "إصابات" : "Hits"}</label>
            <input
              type="number"
              min={1}
              max={50}
              value={rule.count}
              onChange={(e) => patchRule({ count: Math.max(1, Math.min(50, Number(e.target.value))) })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{isAr ? "المنطقة" : "Zone"}</label>
            <select
              value={rule.zone ?? ""}
              onChange={(e) => {
                const { zone: _omit, ...rest } = rule;
                onChange(mode, {
                  ...config,
                  preset: "CUSTOM",
                  rules: [e.target.value ? { ...rest, zone: e.target.value as RuleZone } : rest],
                });
              }}
              className="w-full px-1 py-1.5 rounded admin-text-2xs font-mono border hud-form-input cursor-pointer"
            >
              <option value="">{isAr ? "أي" : "Any"}</option>
              {RULE_ZONES.map((z) => (
                <option key={z} value={z}>
                  {isAr ? ZONE_LABELS[z].ar : ZONE_LABELS[z].en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{isAr ? "ثم" : "Then"}</label>
            <select
              value={rule.then}
              onChange={(e) => patchRule({ then: e.target.value as RuleAction })}
              className="w-full px-1 py-1.5 rounded admin-text-2xs font-mono border hud-form-input cursor-pointer"
            >
              {RULE_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {isAr ? ACTION_LABELS[a].ar : ACTION_LABELS[a].en}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && <p className="admin-text-2xs font-mono hud-warning">{error}</p>}
    </div>
  );
};
