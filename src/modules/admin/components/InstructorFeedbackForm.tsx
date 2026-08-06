import React, { useState } from "react";
import { Award, MessageSquare } from "lucide-react";

export interface InstructorFeedback {
  triggerControl: number;
  breathing: number;
  targetAcquisition: number;
  comments: string;
}

interface InstructorFeedbackFormProps {
  language: "en" | "ar";
  onSave: (feedback: InstructorFeedback) => void;
  onCancel: () => void;
  onDiscard?: () => void;
  showHeader?: boolean;
}

const SLIDERS = [
  {
    key: "triggerControl" as const,
    en: "Trigger Control (1-10)",
    ar: "التحكم بالزناد (١-١٠)",
  },
  {
    key: "breathing" as const,
    en: "Breathing Control (1-10)",
    ar: "التحكم بالتنفس (١-١٠)",
  },
  {
    key: "targetAcquisition" as const,
    en: "Target Acquisition (1-10)",
    ar: "اقتناص الهدف (١-١٠)",
  },
];

export const InstructorFeedbackForm: React.FC<InstructorFeedbackFormProps> = ({
  language,
  onSave,
  onCancel,
  onDiscard,
  showHeader = true,
}) => {
  const isAr = language === "ar";
  const [triggerControl, setTriggerControl] = useState(8);
  const [breathing, setBreathing] = useState(8);
  const [targetAcquisition, setTargetAcquisition] = useState(8);
  const [comments, setComments] = useState("");

  const values = { triggerControl, breathing, targetAcquisition };
  const setters = {
    triggerControl: setTriggerControl,
    breathing: setBreathing,
    targetAcquisition: setTargetAcquisition,
  };

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      {showHeader && (
        <h4 className="range-rail-label flex items-center gap-1.5 border-b border-hud pb-2 hud-text-secondary">
          <Award className="w-3.5 h-3.5 hud-accent" />
        {isAr ? "تقييم الجولة وملاحظات المدرب" : "Instructor Feedback Form"}
        </h4>
      )}

      <div className="space-y-3.5">
        {SLIDERS.map(({ key, en, ar }) => (
          <div key={key}>
            <div className="flex justify-between range-rail-meta mb-1.5">
              <span>{isAr ? ar : en}</span>
              <span className="range-rail-stat hud-accent">
                {values[key]}/10
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={values[key]}
              onChange={(e) => setters[key](Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none hud-form-range cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
        ))}

        <div>
          <label className="range-rail-label block mb-1.5">
            {isAr ? "ملاحظات المدرب" : "Instructor Comments"}
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={
              isAr
                ? "مثال: يرجى تحسين توازن الجسد أثناء الإطلاق السريع."
                : "e.g. Shooter consistently pulls left during rapid fire."
            }
            rows={3}
            className="w-full px-3 py-2 rounded-lg hud-form-input range-rail-meta resize-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={onDiscard}
            className="range-rail-btn py-2.5 hud-btn-warn rounded-lg cursor-pointer transition-colors"
          >
            {isAr ? "تجاهل" : "Discard"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="range-rail-btn py-2.5 hud-btn-secondary rounded-lg cursor-pointer transition-colors"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                triggerControl,
                breathing,
                targetAcquisition,
                comments,
              })
            }
            className="range-rail-btn py-2.5 hud-btn-primary rounded-lg cursor-pointer transition-colors flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {isAr ? "حفظ" : "Save"}
          </button>
        </div>

        <p className="range-rail-label text-center leading-snug hud-text-subtle normal-case tracking-normal">
          {isAr
            ? "التجاهل يحذف الجلسة. الإلغاء يحفظها كملغاة بدون تقييم. الحفظ يثبتها مع تقييم المدرب."
            : "Discard deletes the session. Cancel saves it as cancelled without feedback. Save finalizes it with coach notes."}
        </p>
      </div>
    </div>
  );
};
