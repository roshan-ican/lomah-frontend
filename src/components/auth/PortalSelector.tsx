// src/components/auth/PortalSelector.tsx
import { motion } from "motion/react";
import { Shield, User } from "lucide-react";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import { ThemeSwitcher } from "../common/ThemeSwitcher";
import { TranslationSet } from "../../translations";
import { goToShooterScan } from "../../utils/shooterNavigation";

interface Props {
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  language: "en" | "ar";
  setLanguage: (v: "en" | "ar") => void;
  isAr: boolean;
  t: TranslationSet;
  onAdminSelect: () => void;
  onShooterSelect: () => void;
}

export function PortalSelector({
  isDarkMode,
  setIsDarkMode,
  language,
  setLanguage,
  isAr,
  t,
  onAdminSelect,
  onShooterSelect,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-4"
    >
      <div
        className={`p-5 rounded-2xl border ${
          isDarkMode
            ? "bg-[#121417] border-glass-border"
            : "bg-white border-gray-200"
        }`}
      >
        <p className="text-center admin-text-sm font-mono text-gray-400 mb-4 select-none">
          {isAr
            ? "يرجى تحديد قناة تسجيل الدخول المخصصة للولوج للمنظومة"
            : "SELECT ACCESS ROAD TO INITIALIZE CONNECTION"}
        </p>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={onAdminSelect}
            className="group p-4 leading-relaxed rounded-xl text-left border cursor-pointer select-none transition-all duration-200 hover:shadow-md bg-transparent border-emerald-500/20 hover:border-emerald-500 hover:bg-emerald-500/[0.02]"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg group-hover:scale-105 transition-transform">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-sans admin-text-lg font-bold text-gray-800 dark:text-white">
                  {isAr
                    ? "مركز التحكم بالميدان (إدارة)"
                    : "Range Control Center"}
                </span>
                <span className="block font-mono admin-text-2xs text-gray-400 mt-0.5">
                  {isAr
                    ? "دخول برتبة مشرف أو معلم رماية (أدوات كاملة وسييطرة)"
                    : "Instructor and Range Officers panel with reports"}
                </span>
              </div>
            </div>
          </button>

          <button
            onClick={goToShooterScan}
            className="group p-4 leading-relaxed rounded-xl text-left border cursor-pointer select-none transition-all duration-200 hover:shadow-md bg-transparent border-gray-200 dark:border-glass-border hover:border-emerald-500/50 hover:bg-emerald-500/[0.01]"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-gray-100 dark:bg-slate-surface text-gray-500 dark:text-gray-400 rounded-lg group-hover:scale-105 transition-transform">
                <User className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-sans admin-text-lg font-bold text-gray-800 dark:text-white">
                  {isAr ? "جهاز الرماة اللوحي (رامٍ)" : "Shooter Terminal"}
                </span>
                <span className="block font-mono admin-text-2xs text-gray-400 mt-0.5">
                  {isAr
                    ? "خاص بأجهزة الحارات واللوحات مقاس ١٠ بوصة للرماة"
                    : "Simplified target view, score records & logs"}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="flex justify-center items-center gap-3">
        <LanguageSwitcher language={language} setLanguage={setLanguage} />
        <ThemeSwitcher isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      </div>
    </motion.div>
  );
}
