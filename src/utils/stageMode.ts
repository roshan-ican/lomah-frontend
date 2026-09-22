export type StageMode = "STATIC" | "TIMELINE" | "REACTIVE" | "COMBINED";
export type StagePreset = "PEEKABOO" | "DROP_AFTER_N" | "SNAP" | "CUSTOM";
export type RuleZone = "CENTER" | "MIDDLE" | "OUTER" | "SILHOUETTE";
export type RuleAction = "DROP_AND_HOLD" | "DROP_AND_RESUME" | "END_STAGE";

export interface TimelineConfig {
  repeat: number;
  upForMs: number[];
  downForMs: number;
}

export interface StageRule {
  when: "hits";
  zone?: RuleZone;
  count: number;
  then: RuleAction;
}

export interface StageModeConfig {
  preset?: StagePreset;
  timeline?: TimelineConfig;
  rules?: StageRule[];
}

export const MIN_STEP_MS = 1000;
export const MAX_REPEAT = 50;
export const MAX_TOTAL_SECONDS = 600;

export const RULE_ZONES: RuleZone[] = ["CENTER", "MIDDLE", "OUTER", "SILHOUETTE"];
export const RULE_ACTIONS: RuleAction[] = ["DROP_AND_HOLD", "DROP_AND_RESUME", "END_STAGE"];

export const ZONE_LABELS: Record<RuleZone, { en: string; ar: string }> = {
  CENTER: { en: "Center", ar: "المركز" },
  MIDDLE: { en: "Middle", ar: "الوسط" },
  OUTER: { en: "Outer", ar: "الخارجي" },
  SILHOUETTE: { en: "Silhouette", ar: "الهيكل" },
};

export const ACTION_LABELS: Record<RuleAction, { en: string; ar: string }> = {
  DROP_AND_HOLD: { en: "Drop and stay down", ar: "يسقط ويبقى" },
  DROP_AND_RESUME: { en: "Drop, then resume", ar: "يسقط ثم يعود" },
  END_STAGE: { en: "End the stage", ar: "إنهاء المرحلة" },
};

export interface PresetDefinition {
  id: Exclude<StagePreset, "CUSTOM">;
  mode: StageMode;
  label: { en: string; ar: string };
  guide: { en: string; ar: string };
  trains: { en: string; ar: string };
  config: Omit<StageModeConfig, "preset">;
}

export const STAGE_PRESETS: PresetDefinition[] = [
  {
    id: "PEEKABOO",
    mode: "TIMELINE",
    label: { en: "Peekaboo", ar: "الظهور والاختفاء" },
    guide: {
      en: "Target shows 5 times for 3 s, hiding 2 s between.",
      ar: "يظهر الهدف ٥ مرات لمدة ٣ ث، ويختفي ٢ ث بينها.",
    },
    trains: { en: "Speed and target acquisition", ar: "السرعة والتقاط الهدف" },
    config: { timeline: { repeat: 5, upForMs: [3000], downForMs: 2000 } },
  },
  {
    id: "DROP_AFTER_N",
    mode: "REACTIVE",
    label: { en: "Drop after 3", ar: "يسقط بعد ٣" },
    guide: {
      en: "Target falls after 3 hits and stays down.",
      ar: "يسقط الهدف بعد ٣ إصابات ويبقى ساقطاً.",
    },
    trains: { en: "Accuracy against a goal", ar: "الدقة لتحقيق هدف" },
    config: { rules: [{ when: "hits", count: 3, then: "DROP_AND_HOLD" }] },
  },
  {
    id: "SNAP",
    mode: "TIMELINE",
    label: { en: "Snap", ar: "الخاطف" },
    guide: {
      en: "Target flashes up for 1 s, 5 times, 3 s apart.",
      ar: "يظهر الهدف لمدة ١ ث، ٥ مرات، بفاصل ٣ ث.",
    },
    trains: { en: "Reaction time", ar: "زمن رد الفعل" },
    config: { timeline: { repeat: 5, upForMs: [1000], downForMs: 3000 } },
  },
];

export function expandUpDurations(t: TimelineConfig): number[] {
  if (!t.upForMs.length) return [];
  return Array.from({ length: t.repeat }, (_, i) => t.upForMs[i % t.upForMs.length]);
}

export function timelineTotalSeconds(t: TimelineConfig): number {
  return Math.ceil(expandUpDurations(t).reduce((sum, up) => sum + up + t.downForMs, 0) / 1000);
}

export function timelineError(t: TimelineConfig, isAr: boolean): string | null {
  if (t.repeat < 1 || t.repeat > MAX_REPEAT) {
    return isAr ? `عدد مرات الظهور من ١ إلى ${MAX_REPEAT}` : `Exposures must be 1–${MAX_REPEAT}`;
  }
  if (!t.upForMs.length || t.upForMs.some((ms) => ms < MIN_STEP_MS) || t.downForMs < MIN_STEP_MS) {
    return isAr ? "أقل مدة هي ١ ث" : "Every up/down time must be at least 1 s";
  }
  const total = timelineTotalSeconds(t);
  if (total > MAX_TOTAL_SECONDS) {
    return isAr
      ? `البرنامج يستمر ${total} ث، والحد ${MAX_TOTAL_SECONDS} ث`
      : `Program runs ${total}s, over the ${MAX_TOTAL_SECONDS}s limit`;
  }
  return null;
}

const secs = (ms: number) => `${ms / 1000}s`;

function timelineSentence(t: TimelineConfig, isAr: boolean): string {
  const ups = expandUpDurations(t);
  const same = ups.every((u) => u === ups[0]);
  const total = timelineTotalSeconds(t);
  if (isAr) {
    const each = same ? `لمدة ${ups[0] / 1000} ث في كل مرة` : `بالمدد ${ups.map((u) => u / 1000).join("، ")} ث`;
    return `يظهر الهدف ${t.repeat} مرات ${each}، ويختفي ${t.downForMs / 1000} ث بينها. (~${total} ث)`;
  }
  const each = same ? `for ${secs(ups[0])} each` : `for ${ups.map(secs).join(", ")}`;
  return `Target exposes ${t.repeat} time${t.repeat === 1 ? "" : "s"} ${each}, hiding ${secs(t.downForMs)} between. (~${total}s)`;
}

function ruleSentence(r: StageRule, isAr: boolean): string {
  const zone = r.zone ? ZONE_LABELS[r.zone] : null;
  if (isAr) {
    const where = zone ? ` في ${zone.ar}` : "";
    const then = {
      DROP_AND_HOLD: "يسقط ويبقى ساقطاً",
      DROP_AND_RESUME: "يسقط ثم يعود",
      END_STAGE: "تنتهي المرحلة",
    }[r.then];
    return `بعد ${r.count} إصابات${where}، ${then}.`;
  }
  const where = zone ? ` in ${zone.en.toLowerCase()}` : "";
  const then = {
    DROP_AND_HOLD: "the target drops and stays down",
    DROP_AND_RESUME: "the target drops, then comes back up",
    END_STAGE: "the stage ends",
  }[r.then];
  return `After ${r.count} hit${r.count === 1 ? "" : "s"}${where}, ${then}.`;
}

export function modeSentence(mode: StageMode, config: StageModeConfig, isAr: boolean): string {
  const parts: string[] = [];
  if (config.timeline) parts.push(timelineSentence(config.timeline, isAr));
  for (const rule of config.rules ?? []) parts.push(ruleSentence(rule, isAr));
  if (mode === "TIMELINE") {
    parts.push(isAr ? "تنتهي بعد آخر ظهور." : "Ends after the last exposure.");
  } else if (mode === "REACTIVE") {
    parts.push(isAr ? `حد أقصى ${MAX_TOTAL_SECONDS / 60} دقائق.` : `Capped at ${MAX_TOTAL_SECONDS / 60} min.`);
  }
  return parts.join(" ");
}

export function behaviourLabel(mode: StageMode, config: StageModeConfig | null | undefined, isAr: boolean): string {
  const preset = STAGE_PRESETS.find((p) => p.id === config?.preset);
  if (preset) return isAr ? preset.label.ar : preset.label.en;
  if (mode === "TIMELINE") return isAr ? "ظهور بالتوقيت" : "Timed exposures";
  if (mode === "REACTIVE") return isAr ? "يتفاعل مع الإصابات" : "Reacts to hits";
  if (mode === "COMBINED") return isAr ? "توقيت + إصابات" : "Timed + hits";
  return isAr ? "ثابت" : "Static";
}
