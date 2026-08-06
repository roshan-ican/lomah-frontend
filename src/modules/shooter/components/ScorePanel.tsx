import React from "react";
import { Award, Target, Activity } from "lucide-react";
import { motion } from "motion/react";
import { TranslationSet } from "../../../translations";
import type { DisplayShot } from "../../../types";

interface ScorePanelProps {
  shots: DisplayShot[];
  totalScore: number;
  avgDeviation: number;
  language: "en" | "ar";
  t: TranslationSet;
  variant?: "default" | "hud";
  analyticsOnly?: boolean;
}

export function getTacticalTips(
  lastShot: DisplayShot | null,
  isAr: boolean,
): string[] {
  if (!lastShot) {
    return [
      isAr
        ? "بانتظار الإطلاقة الأولى لبدء تقييم المسافة."
        : "Awaiting first shot telemetry.",
    ];
  }

  if (lastShot.zone === "Off-Target") {
    return [
      isAr ? "تحذير: طلقة خارج نطاق الهدف" : "Miss recorded — off target",
      isAr
        ? "تحقق من ثبات المعصم والزناد"
        : "Verify weapon hold and trigger pull",
    ];
  }

  if (lastShot.score >= 9.8) {
    return [
      isAr ? "إصابة مركزية دقيقة" : "Excellent bullseye hit",
      isAr ? "حافظ على هذا الوضعية" : "Hold this stance and breathing rhythm",
    ];
  }

  if (lastShot.x < -30) {
    return [
      isAr ? "المجموعة تنحرف يساراً" : "Grouping slightly left",
      isAr ? "تحقق من ضغط القبضة" : "Check grip pressure",
      isAr ? "اضبط محاذاة المعصم" : "Adjust wrist alignment",
    ];
  }

  if (lastShot.x > 30) {
    return [
      isAr ? "المجموعة تنحرف يميناً" : "Grouping slightly right",
      isAr ? "ثبت الإصبع على الزناد" : "Check index finger trigger contact",
      isAr ? "راجع محاذاة النظر" : "Review sight alignment",
    ];
  }

  if (lastShot.y > 30) {
    return [
      isAr ? "انحراف للأعلى" : "Shots grouping high",
      isAr ? "اخفض السنان قليلاً" : "Lower front sight post incrementally",
    ];
  }

  if (lastShot.y < -30) {
    return [
      isAr ? "انحراف للأسفل" : "Shots grouping low",
      isAr ? "تجنب شد السلاح عند السحب" : "Avoid pulling down at trigger break",
    ];
  }

  return [
    isAr ? "إصابة جيدة ومقبولة" : "Consistent impact zone",
    isAr ? "استمر بتركيز الإطلاق" : "Maintain present sight alignment",
  ];
}

export const ScorePanel: React.FC<ScorePanelProps> = ({
  shots,
  totalScore,
  avgDeviation,
  language,
  t,
  variant = "default",
  analyticsOnly = false,
}) => {
  const isAr = language === "ar";
  const isHud = variant === "hud";
  const lastShot = shots.length > 0 ? shots[0] : null;
  const tips = getTacticalTips(lastShot, isAr);

  if (isHud) {
    const analysisBlock = (
      <div className="hud-analysis-glow rounded-sm px-5 py-4">
        <span className="hud-label block mb-3 hud-accent">
          {isAr ? "تحليل تكتيكي" : "AI ANALYSIS"}
        </span>
        <ul className="space-y-2">
          {tips.map((tip) => (
            <li
              key={tip}
              className="flex items-start gap-2 text-sm font-mono hud-text-secondary"
            >
              <span className="hud-accent shrink-0 mt-px">✓</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    );

    if (analyticsOnly) {
      return analysisBlock;
    }

    return (
      <div className="space-y-6">
        <div className="flex items-stretch justify-center md:justify-start gap-0">
          {[
            { label: t.shotsFired, value: String(shots.length) },
            {
              label: t.totalScore,
              value: `${totalScore}/${shots.length * 10 || 0}`,
            },
            {
              label: isAr ? "حجم المجموعة" : "GROUP SIZE",
              value: `${avgDeviation}mm`,
            },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && (
                <div className="hud-divider mx-6 md:mx-10 self-stretch" />
              )}
              <div className="text-center min-w-[5rem]">
                <span className="hud-label block mb-2 hud-text-muted">
                  {stat.label}
                </span>
                <motion.span
                  key={stat.value}
                  initial={{ opacity: 0.6, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="hud-value text-2xl md:text-3xl hud-text block tabular-nums"
                >
                  {stat.value}
                </motion.span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {analysisBlock}
      </div>
    );
  }

  const getShooterFeedback = () => getTacticalTips(lastShot, isAr)[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-[#1C1F26] p-4 rounded-xl border border-gray-200 dark:border-glass-border flex items-center gap-3.5 shadow-sm">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-[#378ADD] shrink-0">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <span className="block text-xs uppercase font-mono text-gray-400 font-bold select-none">
            {t.shotsFired}
          </span>
          <span className="text-xl font-mono font-bold block mt-0.5">
            {shots.length}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1C1F26] p-4 rounded-xl border border-gray-200 dark:border-glass-border flex items-center gap-3.5 shadow-sm">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-[#68dbae] shrink-0">
          <Award className="w-5 h-5" />
        </div>
        <div>
          <span className="block text-xs uppercase font-mono text-gray-400 font-bold select-none">
            {t.totalScore}
          </span>
          <span className="text-xl font-mono font-bold block mt-0.5">
            {totalScore}{" "}
            <span className="text-xs text-gray-400">/ {shots.length * 10}</span>
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1C1F26] p-4 rounded-xl border border-gray-200 dark:border-glass-border flex items-center gap-3.5 shadow-sm">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-orange-500/10 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 shrink-0">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <span className="block text-xs uppercase font-mono text-gray-400 font-bold select-none">
            {t.avgDeviation}
          </span>
          <span className="text-xl font-mono font-bold block mt-0.5">
            {avgDeviation}
          </span>
        </div>
      </div>

      <div className="md:col-span-3 bg-emerald-500/5 dark:bg-emerald-success/10 border border-emerald-500/20 dark:border-emerald-success/20 p-3.5 rounded-xl flex items-start gap-2.5">
        <div>
          <span className="block text-xs font-mono uppercase font-bold text-gray-400">
            {isAr ? "تحديث وتوجيهات الرماية" : "Tactical Range Feedback"}
          </span>
          <p className="text-xs font-semibold text-gray-700 dark:text-emerald-400 mt-1 leading-relaxed">
            {getShooterFeedback()}
          </p>
        </div>
      </div>
    </div>
  );
};
