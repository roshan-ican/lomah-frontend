import React from "react";
import { Globe } from "lucide-react";

interface LanguageSwitcherProps {
  language: "en" | "ar";
  setLanguage: (lang: "en" | "ar") => void;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  language,
  setLanguage,
}) => {
  return (
    <button
      onClick={() => setLanguage(language === "en" ? "ar" : "en")}
      className="touch-target px-2.5 rounded admin-text-sm font-mono font-bold inline-flex items-center justify-center gap-1.5 border transition-all border-gray-200 dark:border-glass-border bg-gray-50 dark:bg-[#1C1F26] text-gray-700 dark:text-[#bccac1] hover:bg-gray-100 dark:hover:bg-[#2A2E37]"
    >
      <Globe className="w-3.5 h-3.5 text-emerald-500" />
      <span>{language === "en" ? "Arabic" : "English"}</span>
    </button>
  );
};
