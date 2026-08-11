import type React from "react";
import {
  Activity,
  Shield,
  LogOut,
  Menu,
  X,
  Monitor,
  FileText,
} from "lucide-react";
import { LanguageSwitcher } from "../../../../components/common/LanguageSwitcher";
import { ThemeSwitcher } from "../../../../components/common/ThemeSwitcher";
import type { TranslationSet } from "../../../../translations";
import type { LanguageCode } from "./types";

interface Props {
  t: TranslationSet;
  isAr: boolean;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  navOpen: boolean;
  setNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  liveFiringCount: number;
  handleLogout: () => void;
}

export function AdminHeader({
  t,
  isAr,
  isDarkMode,
  setIsDarkMode,
  language,
  setLanguage,
  navOpen,
  setNavOpen,
  liveFiringCount,
  handleLogout,
}: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 admin-app-header safe-area-inset-x border-b border-hud flex justify-between items-center z-40 bg-hud-rail">
      <div className="flex items-center gap-1.5 sm:gap-2 select-none min-w-0">
        <button
          type="button"
          onClick={() => setNavOpen((open) => !open)}
          className="touch-target inline-flex items-center justify-center rounded-lg border border-hud hover:bg-[var(--hud-accent-bg-subtle)] hud-text-secondary transition-colors cursor-pointer shrink-0"
          aria-label={
            navOpen
              ? isAr
                ? "إخفاء القائمة"
                : "Close navigation"
              : isAr
                ? "فتح القائمة"
                : "Open navigation"
          }
          aria-expanded={navOpen}
        >
          {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Shield className="w-5 h-5 sm:w-6 sm:h-6 hud-accent shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="font-mono admin-text-2xs tracking-widest font-bold uppercase hud-accent truncate">
            {t.brand}
            <span className="hidden sm:inline">
              {isAr ? "مركز التحكم بالمشرفين" : "ADMIN CONTROL CENTER"}
            </span>
          </span>
          <span className="hidden sm:block font-mono admin-text-2xs hud-text-subtle">
            {t.secureTerminal}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {liveFiringCount > 0 && (
          <span
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full hud-success admin-text-2xs font-mono font-bold uppercase tracking-wide"
            title={
              isAr
                ? "حارات الرماية النشطة حالياً"
                : "Lanes with active shooting sessions"
            }
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            {liveFiringCount} {isAr ? "حارة نشطة" : "LIVE"}
          </span>
        )}
        {window.electronAPI?.isElectron && (
          <button
            onClick={() => window.electronAPI!.setMode("shooter")}
            className="touch-target inline-flex items-center justify-center rounded admin-text-xs font-mono font-bold hud-text-subtle hover:hud-accent hover:bg-[var(--hud-accent-bg-subtle)] border border-transparent hover:border-[var(--hud-accent-border)] cursor-pointer gap-1"
            title={isAr ? "التبديل إلى وضع الرامي" : "Switch to Shooter Mode"}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isAr ? "وضع الرامي" : "Shooter"}
            </span>
          </button>
        )}
        {window.electronAPI?.isElectron && (
          <button
            onClick={() => window.electronAPI!.openLogsFolder()}
            className="touch-target inline-flex items-center justify-center rounded admin-text-xs font-mono font-bold hud-text-subtle hover:hud-warning hover:bg-[var(--hud-warning-bg)] border border-transparent hover:border-[var(--hud-warning-border)] cursor-pointer gap-1"
            title="Open Backend Logs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logs</span>
          </button>
        )}
        <LanguageSwitcher language={language} setLanguage={setLanguage} />
        <ThemeSwitcher isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        <button
          onClick={handleLogout}
          className="touch-target inline-flex items-center justify-center rounded admin-text-xs font-mono font-bold hud-danger hover:bg-[var(--hud-danger-bg)] border border-transparent hover:border-[var(--hud-danger-border)] cursor-pointer px-3 py-2"
        >
          <LogOut className="w-3.5 h-3.5 text-center justify-center" />
          <span className="hidden sm:inline">{t.logoutNode}</span>
        </button>
      </div>
    </header>
  );
}
