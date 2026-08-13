// First-run role picker for a device that has never been told whether it's the
// admin PC or a shooter terminal. Rendered standalone (no router, no App auth
// state) from main.tsx's Root() when Electron's main process finds no stored
// mode and no --role= launch arg — see main.ts's app.whenReady() and
// urlForPicker(). Deliberately does nothing but call setMode: no backend has
// been started and no admin role has been claimed yet, so this screen must not
// assume either exists.
import { useState } from "react";
import { motion } from "motion/react";
import { Target } from "lucide-react";
import { PortalSelector } from "./auth/PortalSelector";
import { LanguageSwitcher } from "./common/LanguageSwitcher";
import { ThemeSwitcher } from "./common/ThemeSwitcher";
import { translations } from "../translations";

export function RoleSetup() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("lomah_theme");
    if (stored === "light") return false;
    return true;
  });
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const isAr = language === "ar";
  const t = translations[language];
  const [choosing, setChoosing] = useState<"admin" | "shooter" | null>(null);

  const choose = async (mode: "admin" | "shooter") => {
    setChoosing(mode);
    // set-mode persists the choice, claims/releases the admin role, starts or
    // skips the backend, and navigates this window — same IPC path every later
    // role switch (e.g. the shooter's "Admin Mode" button) already goes
    // through, so this first choice isn't a special case for main.ts to keep
    // in sync.
    await window.electronAPI!.setMode(mode);
  };

  // PortalSelector's shooter button ignores its onShooterSelect prop and always
  // calls goToShooterScan() directly (a pre-existing bug, out of scope here —
  // it also means App.tsx's own onShooterSelect, a username/password login
  // route, is unreachable through that button too). That happens to still do
  // the right thing here: in this Electron bootstrap context goToShooterScan
  // calls the same setMode("shooter") this component would have. The only
  // loss is the "Switching..." message below for that one button.

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-4 ${
        isDarkMode ? "bg-[#111316] text-gray-100" : "bg-page-bg text-gray-900"
      }`}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-6 select-none">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-success/10 flex items-center justify-center border border-emerald-500/20 mb-3.5">
            <Target className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-widest font-sans text-gray-800 dark:text-white uppercase">
            {t.brand}
          </h1>
          <p className="admin-text-sm font-mono text-gray-500 mt-1">
            {isAr
              ? "أول تشغيل — اختر دور هذا الجهاز"
              : "First launch — set this device's role"}
          </p>
        </div>

        {choosing ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`p-5 rounded-2xl border text-center ${
              isDarkMode
                ? "bg-[#121417] border-glass-border"
                : "bg-white border-gray-200"
            }`}
          >
            <p className="admin-text-lg font-mono text-gray-400">
              {choosing === "admin"
                ? isAr
                  ? "جاري إعداد وضع المشرف..."
                  : "Setting up admin mode..."
                : isAr
                  ? "جاري التبديل إلى وضع الرامي..."
                  : "Switching to shooter mode..."}
            </p>
          </motion.div>
        ) : (
          <PortalSelector
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            language={language}
            setLanguage={setLanguage}
            isAr={isAr}
            t={t}
            onAdminSelect={() => void choose("admin")}
            onShooterSelect={() => void choose("shooter")}
          />
        )}

        {/* Only while the role is being set up. PortalSelector renders its own
            pair, so showing these unconditionally put two identical rows of
            language and theme buttons on the first screen anyone sees. */}
        {choosing && (
          <div className="flex justify-center items-center gap-3 mt-4">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <ThemeSwitcher isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
          </div>
        )}

        <p className="text-center admin-text-sm font-mono text-gray-500 mt-6">
          {isAr
            ? "يمكن تغيير هذا لاحقاً من داخل التطبيق."
            : "This can be changed later from within the app."}
        </p>
      </div>
    </div>
  );
}
